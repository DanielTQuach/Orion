"""
FOV crossing scan router.
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Satellite, FovCrossingEvent
from services.fov_scan import scan_fov_window, DEMO_TELESCOPE_ID, DEMO_CONFIG
from services.cache import tle_cache
from services.demo import ensure_fallback_tles, inject_demo_fov_crossings

router = APIRouter(tags=["fov"])


class FovScanRequest(BaseModel):
    telescope_id: str
    hours_ahead: float = 1.0
    step_seconds: int = 30
    fov_deg: float = 2.0
    boresight_az_deg: float | None = None
    boresight_el_deg: float | None = None
    track_norad_id: int | None = None
    norad_ids: list[int] | None = None


@router.post("/fov/scan")
async def trigger_fov_scan(req: FovScanRequest, db: AsyncSession = Depends(get_db)):
    """
    Scan for satellites crossing the telescope field of view.

    Boresight is fixed for the scan window (long-exposure model).
    The DEMO telescope auto-locks boresight to ISS at scan start.
    """
    if req.norad_ids:
        norad_ids = req.norad_ids
    else:
        result = await db.execute(select(Satellite.norad_id))
        all_ids = [row[0] for row in result.all()]
        norad_ids = [nid for nid in all_ids if tle_cache.get(f"tle:{nid}") is not None]

    if not norad_ids:
        ensure_fallback_tles()
        result = await db.execute(select(Satellite.norad_id))
        all_ids = [row[0] for row in result.all()]
        norad_ids = [nid for nid in all_ids if tle_cache.get(f"tle:{nid}") is not None]

    telescope_id = req.telescope_id.upper()
    start = datetime.now(timezone.utc)
    end = start + timedelta(hours=req.hours_ahead)

    events = await scan_fov_window(
        telescope_id=telescope_id,
        norad_ids=norad_ids,
        start=start,
        end=end,
        fov_deg=req.fov_deg,
        step_seconds=req.step_seconds,
        boresight_az_deg=req.boresight_az_deg,
        boresight_el_deg=req.boresight_el_deg,
        track_norad_id=req.track_norad_id,
        db=db,
    )

    demo_note = None
    if telescope_id == DEMO_TELESCOPE_ID:
        below_horizon = bool(events) and all(
            (e.get("boresight_el_deg") or 0) < 5 for e in events
        )
        if not events or below_horizon:
            injected = await inject_demo_fov_crossings(db, start, end)
            events = events + injected
        demo_note = (
            f"Demo mode: {DEMO_CONFIG['fov_deg']}° FOV, boresight locked to "
            f"NORAD {DEMO_CONFIG['track_norad_id']} at scan start."
        )

    return {
        "telescope_id": telescope_id,
        "scanned_sats": len(norad_ids),
        "window_hours": req.hours_ahead,
        "events_found": len(events),
        "events": events,
        "demo_note": demo_note,
    }


@router.get("/fov/crossings")
async def get_fov_crossings(
    telescope_id: str | None = Query(None),
    norad_id: int | None = Query(None),
    start: str | None = Query(None),
    end: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(FovCrossingEvent)
    if telescope_id:
        stmt = stmt.where(FovCrossingEvent.telescope_id == telescope_id.upper())
    if norad_id:
        stmt = stmt.where(FovCrossingEvent.norad_id == norad_id)
    if start:
        stmt = stmt.where(FovCrossingEvent.event_time >= start)
    if end:
        stmt = stmt.where(FovCrossingEvent.event_time <= end)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "norad_id": r.norad_id,
            "telescope_id": r.telescope_id,
            "event_time": r.event_time,
            "duration_s": r.duration_s,
            "separation_deg": r.separation_deg,
            "boresight_az_deg": r.boresight_az_deg,
            "boresight_el_deg": r.boresight_el_deg,
            "fov_deg": r.fov_deg,
        }
        for r in rows
    ]


@router.get("/fov/demo-config")
async def get_demo_config():
    """Return demo telescope configuration for the UI."""
    return {
        "telescope_id": DEMO_TELESCOPE_ID,
        "fov_deg": DEMO_CONFIG["fov_deg"],
        "track_norad_id": DEMO_CONFIG["track_norad_id"],
        "description": (
            "Demo telescope with a fixed boresight locked to ISS at scan start. "
            "Guarantees FOV crossing predictions for walkthroughs."
        ),
    }
