"""
Demo catalog + guaranteed walkthrough data.

Ensures the DEMO telescope, seed satellites, and fallback TLEs exist so
nearby satellites, FOV predictions, and the RAG pipeline always have
something to show when CelesTrak or watsonx is unavailable.
"""
import logging
import math
from datetime import datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import Satellite, Telescope, FovCrossingEvent
from services.cache import tle_cache
from services.fov_scan import DEMO_TELESCOPE_ID, DEMO_CONFIG, _time_bucket
from services.geometry import _dt_to_jd, _gmst
from services.keepout import is_pointing_safe

logger = logging.getLogger(__name__)

DEMO_LAT = 38.9214
DEMO_LON = -77.0672
DEMO_ALT_M = 92.0
DEMO_NAME = "Orion Demo Telescope"

DEMO_SCIENCE_GOAL = (
    "Demo: map diffraction spikes on a keep-out-safe zenith field "
    "while accounting for ISS trail contamination."
)

SEED_SATELLITES = [
    {"norad_id": 20580, "name": "HUBBLE SPACE TELESCOPE", "operator": "NASA", "category": "Space Telescope", "is_reflective": True, "source": "celestrak"},
    {"norad_id": 50463, "name": "JAMES WEBB SPACE TELESCOPE", "operator": "NASA/ESA/CSA", "category": "Space Telescope", "is_reflective": True, "source": "horizons"},
    {"norad_id": 25544, "name": "ISS (ZARYA)", "operator": "Multi-national", "category": "Space Station", "is_reflective": True, "source": "celestrak"},
    {"norad_id": 48274, "name": "STARLINK-2688", "operator": "SpaceX", "category": "Starlink", "is_reflective": True, "source": "celestrak"},
    {"norad_id": 44713, "name": "ONEWEB-0008", "operator": "OneWeb", "category": "OneWeb", "is_reflective": True, "source": "celestrak"},
]


async def ensure_demo_catalog(db: AsyncSession) -> None:
    """Upsert the DEMO telescope and the five walkthrough satellites."""
    if not await db.get(Telescope, DEMO_TELESCOPE_ID):
        db.add(Telescope(
            telescope_id=DEMO_TELESCOPE_ID,
            name=DEMO_NAME,
            lat=DEMO_LAT,
            lon=DEMO_LON,
            alt_m=DEMO_ALT_M,
            operator="Orion",
        ))
        logger.info("Seeded DEMO telescope")

    for sat in SEED_SATELLITES:
        if not await db.get(Satellite, sat["norad_id"]):
            db.add(Satellite(**sat))
            logger.info("Seeded satellite %s", sat["name"])

    await db.commit()


def ensure_fallback_tles() -> int:
    """If the TLE cache is empty, load static TLEs so demo scans can propagate."""
    if tle_cache.size() > 0:
        return 0
    from seed_tles import apply_static_tles
    n = apply_static_tles()
    logger.info("Loaded %d fallback TLEs (CelesTrak empty)", n)
    return n


def demo_safe_pointing(
    dt: datetime,
    observatory_lat_deg: float = DEMO_LAT,
) -> tuple[float, float]:
    """
    Point near local zenith, then rotate in RA until Sun/Moon keep-out is clear.
    """
    jd_full, jd_frac = _dt_to_jd(dt)
    ra = math.degrees(_gmst(jd_full, jd_frac)) % 360.0
    dec = observatory_lat_deg
    for _ in range(12):
        result = is_pointing_safe(ra, dec, dt)
        if result["safe"]:
            return round(ra, 4), round(dec, 4)
        ra = (ra + 30.0) % 360.0
    return round(ra, 4), round(dec, 4)


def demo_mast_observations(ra_deg: float, dec_deg: float) -> list[dict]:
    return [
        {
            "obs_id": "DEMO-HST-001",
            "obs_collection": "HST",
            "target_name": "Orion Demo Field",
            "s_ra": ra_deg,
            "s_dec": dec_deg,
            "t_exptime": 600,
        },
        {
            "obs_id": "DEMO-HST-002",
            "obs_collection": "HST",
            "target_name": "Orion Demo Offset",
            "s_ra": (ra_deg + 0.12) % 360.0,
            "s_dec": dec_deg - 0.08,
            "t_exptime": 480,
        },
    ]


def demo_guide_stars(ra_deg: float, dec_deg: float) -> list[dict]:
    return [
        {"ra": ra_deg + 0.04, "dec": dec_deg + 0.03, "mag": 11.2},
        {"ra": ra_deg - 0.05, "dec": dec_deg + 0.02, "mag": 12.1},
        {"ra": ra_deg + 0.02, "dec": dec_deg - 0.06, "mag": 10.8},
    ]


async def inject_demo_fov_crossings(
    db: AsyncSession,
    start: datetime,
    end: datetime,
) -> list[dict]:
    """
    Insert ISS trail events across the window so Predict always has results
    when live propagation finds nothing (stale or missing TLE).
    """
    track_id = DEMO_CONFIG["track_norad_id"]
    offsets = [
        timedelta(minutes=0),
        timedelta(minutes=18),
        timedelta(minutes=47),
        timedelta(hours=2, minutes=10),
        timedelta(hours=4, minutes=5),
    ]
    events: list[dict] = []
    for delta in offsets:
        t = start + delta
        if t > end:
            continue
        bucket = _time_bucket(t)
        existing = await db.execute(
            select(FovCrossingEvent).where(
                FovCrossingEvent.norad_id == track_id,
                FovCrossingEvent.telescope_id == DEMO_TELESCOPE_ID,
                FovCrossingEvent.event_time == bucket,
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            continue
        event = FovCrossingEvent(
            norad_id=track_id,
            telescope_id=DEMO_TELESCOPE_ID,
            event_time=bucket,
            duration_s=60,
            separation_deg=0.12,
            boresight_az_deg=180.0,
            boresight_el_deg=55.0,
            fov_deg=DEMO_CONFIG["fov_deg"],
        )
        db.add(event)
        events.append({
            "norad_id": track_id,
            "telescope_id": DEMO_TELESCOPE_ID,
            "event_time": bucket,
            "separation_deg": 0.12,
            "duration_s": 60,
            "boresight_az_deg": 180.0,
            "boresight_el_deg": 55.0,
            "fov_deg": DEMO_CONFIG["fov_deg"],
        })
    if events:
        await db.commit()
        logger.info("Injected %d DEMO FOV crossings", len(events))
    return events
