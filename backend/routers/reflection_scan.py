"""
Reflection scan router.
Exposes POST /api/reflections/scan to trigger a scan for a telescope
over a configurable time window.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Satellite
from sqlalchemy import select
from services.reflection_scan import scan_window
from services.cache import tle_cache

router = APIRouter(tags=["reflection-scan"])


class ScanRequest(BaseModel):
    telescope_id: str
    hours_ahead: float = 1.0          # how many hours forward to scan
    step_seconds: int  = 60           # time resolution in seconds
    threshold_deg: float = 1.0        # specular angle threshold
    norad_ids: list[int] | None = None  # specific satellites; None = all cached


@router.post("/reflections/scan")
async def trigger_scan(req: ScanRequest, db: AsyncSession = Depends(get_db)):
    """
    Scan for specular reflection events between a telescope and satellites.

    - Uses cached TLEs — run POST /api/tle/refresh first if cache is empty.
    - Deduplicates against existing reflection_events rows.
    - Returns detected events (new ones only; duplicates skipped).
    """
    # Resolve NORAD IDs to scan
    if req.norad_ids:
        norad_ids = req.norad_ids
    else:
        # Use all satellites in DB that are marked reflective and have a cached TLE
        result = await db.execute(
            select(Satellite.norad_id).where(Satellite.is_reflective == True)
        )
        all_ids = [row[0] for row in result.all()]
        norad_ids = [nid for nid in all_ids if tle_cache.get(f"tle:{nid}") is not None]

    if not norad_ids:
        raise HTTPException(
            status_code=422,
            detail="No satellites with cached TLEs found. Call POST /api/tle/refresh first.",
        )

    start = datetime.now(timezone.utc)
    end   = start + timedelta(hours=req.hours_ahead)

    events = await scan_window(
        telescope_id  = req.telescope_id.upper(),
        norad_ids     = norad_ids,
        start         = start,
        end           = end,
        step_seconds  = req.step_seconds,
        threshold_deg = req.threshold_deg,
        db            = db,
    )

    return {
        "telescope_id":   req.telescope_id.upper(),
        "scanned_sats":   len(norad_ids),
        "window_hours":   req.hours_ahead,
        "events_found":   len(events),
        "events":         events,
    }


@router.get("/reflections/check")
async def quick_check(
    telescope_id: str = Query(...),
    norad_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Instant single-satellite check at current time.
    Returns whether a reflection is currently occurring.
    """
    from services.geometry import sun_position_ecef, is_reflection, geodetic_to_ecef
    from services.propagation import propagate
    from models import Telescope

    tel = await db.get(Telescope, telescope_id.upper())
    if not tel:
        raise HTTPException(status_code=404, detail="Telescope not found")

    pos = propagate(norad_id)
    if not pos:
        raise HTTPException(status_code=404, detail=f"No cached TLE for NORAD {norad_id}")

    now      = datetime.now(timezone.utc)
    sun_ecef = sun_position_ecef(now)
    tel_ecef = geodetic_to_ecef(tel.lat, tel.lon, tel.alt_m)
    sat_ecef = (pos["x_km"], pos["y_km"], pos["z_km"])

    reflecting, angle = is_reflection(sat_ecef, sun_ecef, tel_ecef)

    return {
        "telescope_id": telescope_id.upper(),
        "norad_id":     norad_id,
        "timestamp":    now.isoformat(),
        "reflecting":   reflecting,
        "angle_deg":    round(angle, 4),
        "sat_lat":      pos["lat"],
        "sat_lon":      pos["lon"],
        "sat_alt_km":   pos["alt_km"],
    }
