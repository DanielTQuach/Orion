"""
Reflection scan service.

Scans a time window for specular reflection events between a set of
satellites and a telescope. Uses the geometry engine and deduplicates
against already-stored reflection_events rows.
"""
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import Satellite, Telescope, ReflectionEvent
from services.propagation import propagate, _datetime_to_jd, _gmst, _teme_to_ecef
from services.geometry import sun_position_ecef, is_reflection, geodetic_to_ecef
from services.cache import tle_cache
from services.celestrak import get_tle

logger = logging.getLogger(__name__)

# Time bucket resolution for deduplication (seconds)
# Two events within the same bucket are considered duplicates
BUCKET_SECONDS = 300  # 5 minutes


def _time_bucket(dt: datetime) -> str:
    """Round a datetime down to the nearest BUCKET_SECONDS boundary."""
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
        select(ReflectionEvent).where(
            ReflectionEvent.norad_id    == norad_id,
            ReflectionEvent.telescope_id == telescope_id,
            ReflectionEvent.event_time  == bucket,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def scan_window(
    telescope_id: str,
    norad_ids: list[int],
    start: datetime,
    end: datetime,
    step_seconds: int = 60,
    threshold_deg: float = 1.0,
    db: AsyncSession | None = None,
) -> list[dict]:
    """
    Scan a time window for reflection events.

    For each (satellite, time_step) pair:
    1. Check dedup cache — skip if already in DB
    2. Propagate satellite position
    3. Get Sun position
    4. Run specular geometry check
    5. If reflecting, store in DB and append to results

    Returns list of reflection event dicts.
    """
    # Fetch telescope from DB
    if db is None:
        raise ValueError("db session required")

    tel_row = await db.get(Telescope, telescope_id)
    if not tel_row:
        logger.warning("Telescope %s not found", telescope_id)
        return []

    tel_ecef = geodetic_to_ecef(tel_row.lat, tel_row.lon, tel_row.alt_m)

    events: list[dict] = []
    t = start

    while t <= end:
        bucket = _time_bucket(t)
        sun_ecef = sun_position_ecef(t)

        for norad_id in norad_ids:
            # Skip if already computed for this bucket
            if await _already_computed(norad_id, telescope_id, bucket, db):
                continue

            # Get TLE from cache
            tle = get_tle(norad_id)
            if not tle:
                continue

            # Propagate satellite
            from sgp4.api import Satrec, jday as _jday
            try:
                sat = Satrec.twoline2rv(tle["tle_line1"], tle["tle_line2"])
                jd, fr = _datetime_to_jd(t)
                e, r, v = sat.sgp4(jd, fr)
                if e != 0:
                    continue
                theta = _gmst(jd, fr)
                x, y, z = _teme_to_ecef(r[0], r[1], r[2], theta)
                sat_ecef = (x, y, z)
            except Exception as exc:
                logger.debug("Propagation error NORAD %d: %s", norad_id, exc)
                continue

            # Check reflection
            reflecting, angle = is_reflection(sat_ecef, sun_ecef, tel_ecef, threshold_deg)

            if reflecting:
                event = ReflectionEvent(
                    norad_id     = norad_id,
                    telescope_id = telescope_id,
                    event_time   = bucket,
                    duration_s   = BUCKET_SECONDS,
                    angle_deg    = round(angle, 4),
                )
                db.add(event)
                events.append({
                    "norad_id":     norad_id,
                    "telescope_id": telescope_id,
                    "event_time":   bucket,
                    "angle_deg":    round(angle, 4),
                    "duration_s":   BUCKET_SECONDS,
                })

        t += timedelta(seconds=step_seconds)

    if events:
        await db.commit()
        logger.info("Scan complete: %d reflection events found", len(events))

    return events
