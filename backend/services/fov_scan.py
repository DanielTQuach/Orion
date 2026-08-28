"""
FOV crossing scan service.

Detects when propagated satellites pass through a telescope's field of view.
The DEMO telescope uses a fixed boresight locked to a track satellite's
position at scan start — mimicking a long exposure on a sky patch where
a LEO object will trail through frame.
"""
import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import Telescope, FovCrossingEvent
from services.propagation import _datetime_to_jd, _gmst, _teme_to_ecef
from services.geometry import geodetic_to_ecef
from services.fov_geometry import ecef_to_az_el_deg, is_in_fov, zenith_boresight
from services.celestrak import get_tle
from sgp4.api import Satrec

logger = logging.getLogger(__name__)

BUCKET_SECONDS = 60  # 1-minute buckets for FOV crossings

# Demo-only config — not applied to real observatories.
DEMO_TELESCOPE_ID = "DEMO"
DEMO_CONFIG = {
    "fov_deg": 3.0,
    "track_norad_id": 25544,  # ISS — boresight locked at scan-start position
    "boresight_mode": "track_at_start",
}


def _time_bucket(dt: datetime) -> str:
    ts = int(dt.timestamp())
    bucketed = ts - (ts % BUCKET_SECONDS)
    return datetime.fromtimestamp(bucketed, tz=timezone.utc).isoformat()


async def _already_computed(
    norad_id: int,
    telescope_id: str,
    bucket: str,
    db: AsyncSession,
) -> bool:
    result = await db.execute(
        select(FovCrossingEvent).where(
            FovCrossingEvent.norad_id == norad_id,
            FovCrossingEvent.telescope_id == telescope_id,
            FovCrossingEvent.event_time == bucket,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


def _propagate_ecef(norad_id: int, t: datetime) -> tuple[float, float, float] | None:
    tle = get_tle(norad_id)
    if not tle:
        return None
    try:
        sat = Satrec.twoline2rv(tle["tle_line1"], tle["tle_line2"])
        jd, fr = _datetime_to_jd(t)
        e, r, _v = sat.sgp4(jd, fr)
        if e != 0:
            return None
        theta = _gmst(jd, fr)
        return _teme_to_ecef(r[0], r[1], r[2], theta)
    except Exception:
        return None


def _resolve_boresight(
    telescope_id: str,
    tel_lat: float,
    tel_lon: float,
    tel_ecef: tuple[float, float, float],
    start: datetime,
    boresight_az_deg: float | None,
    boresight_el_deg: float | None,
    track_norad_id: int | None,
) -> tuple[float, float]:
    """Resolve fixed boresight for the scan window."""
    if track_norad_id is not None:
        track_ecef = _propagate_ecef(track_norad_id, start)
        if track_ecef:
            return ecef_to_az_el_deg(tel_ecef, track_ecef, tel_lat, tel_lon)

    if boresight_az_deg is not None and boresight_el_deg is not None:
        return boresight_az_deg, boresight_el_deg

    if telescope_id == DEMO_TELESCOPE_ID:
        track_id = DEMO_CONFIG["track_norad_id"]
        track_ecef = _propagate_ecef(track_id, start)
        if track_ecef:
            az, el = ecef_to_az_el_deg(tel_ecef, track_ecef, tel_lat, tel_lon)
            logger.info(
                "DEMO boresight locked to NORAD %d at scan start: az=%.2f el=%.2f",
                track_id, az, el,
            )
            return az, el

    return zenith_boresight(tel_lat, tel_lon)


async def scan_fov_window(
    telescope_id: str,
    norad_ids: list[int],
    start: datetime,
    end: datetime,
    fov_deg: float = 2.0,
    step_seconds: int = 30,
    boresight_az_deg: float | None = None,
    boresight_el_deg: float | None = None,
    track_norad_id: int | None = None,
    db: AsyncSession | None = None,
) -> list[dict]:
    """
    Scan for satellites crossing the telescope FOV.

    Boresight is fixed for the entire window (long-exposure model).
    Returns newly detected crossing events.
    """
    if db is None:
        raise ValueError("db session required")

    tel_row = await db.get(Telescope, telescope_id)
    if not tel_row:
        logger.warning("Telescope %s not found", telescope_id)
        return []

    if telescope_id == DEMO_TELESCOPE_ID:
        fov_deg = DEMO_CONFIG["fov_deg"]
        if track_norad_id is None and boresight_az_deg is None:
            track_norad_id = DEMO_CONFIG["track_norad_id"]

    tel_ecef = geodetic_to_ecef(tel_row.lat, tel_row.lon, tel_row.alt_m)
    bore_az, bore_el = _resolve_boresight(
        telescope_id,
        tel_row.lat,
        tel_row.lon,
        tel_ecef,
        start,
        boresight_az_deg,
        boresight_el_deg,
        track_norad_id,
    )

    events: list[dict] = []
    t = start

    while t <= end:
        bucket = _time_bucket(t)

        for norad_id in norad_ids:
            if await _already_computed(norad_id, telescope_id, bucket, db):
                continue

            sat_ecef = _propagate_ecef(norad_id, t)
            if not sat_ecef:
                continue

            sat_az, sat_el = ecef_to_az_el_deg(tel_ecef, sat_ecef, tel_row.lat, tel_row.lon)
            inside, sep = is_in_fov(sat_az, sat_el, bore_az, bore_el, fov_deg)

            if inside:
                event = FovCrossingEvent(
                    norad_id=norad_id,
                    telescope_id=telescope_id,
                    event_time=bucket,
                    duration_s=BUCKET_SECONDS,
                    separation_deg=round(sep, 4),
                    boresight_az_deg=round(bore_az, 4),
                    boresight_el_deg=round(bore_el, 4),
                    fov_deg=fov_deg,
                )
                db.add(event)
                events.append({
                    "norad_id": norad_id,
                    "telescope_id": telescope_id,
                    "event_time": bucket,
                    "separation_deg": round(sep, 4),
                    "duration_s": BUCKET_SECONDS,
                    "boresight_az_deg": round(bore_az, 4),
                    "boresight_el_deg": round(bore_el, 4),
                    "fov_deg": fov_deg,
                })

        t += timedelta(seconds=step_seconds)

    if events:
        await db.commit()
        logger.info("FOV scan complete: %d crossing events for %s", len(events), telescope_id)

    return events
