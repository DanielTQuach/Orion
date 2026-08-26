"""
CelesTrak TLE ingestion service.

Fetches Two-Line Element sets from CelesTrak's GP data endpoint
and upserts satellite records + caches TLEs in memory.

GP data API: https://celestrak.org/pub/TLE/<group>.txt  (plain TLE text)
             https://celestrak.org/pub/TLE/<group>.csv  (CSV)
             https://celestrak.org/pub/TLE/<group>.json (JSON — GP fields)
Docs:        https://celestrak.org/SOCRATES/

NOTE: CelesTrak's CDN may return 403 for automated requests without a
proper User-Agent. The HEADERS constant below satisfies their ToS.
"""
import httpx
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert
from models import Satellite
from services.cache import tle_cache

logger = logging.getLogger(__name__)

# CelesTrak requires a descriptive User-Agent per their terms of service
HEADERS = {"User-Agent": "Orion-SatTracker/1.0 (github.com/DanielTQuach/Orion; DanielQ2K15@gmail.com)"}

# Current CelesTrak GP JSON data base URL
CELESTRAK_GP_BASE = "https://celestrak.org/pub/TLE"

# Named groups → GP JSON URLs
# Full group list: https://celestrak.org/SOCRATES/
CELESTRAK_GROUPS: dict[str, str] = {
    "Space Stations":    "https://celestrak.org/pub/TLE/stations.json",
    "Space Telescopes":  "https://celestrak.org/pub/TLE/science.json",
    "Starlink":          "https://celestrak.org/pub/TLE/starlink.json",
    "OneWeb":            "https://celestrak.org/pub/TLE/oneweb.json",
    "Active Satellites": "https://celestrak.org/pub/TLE/active.json",
}

# Map group name → category tag stored in DB
GROUP_CATEGORY: dict[str, str] = {
    "Space Stations":    "Space Station",
    "Space Telescopes":  "Space Telescope",
    "Starlink":          "Starlink",
    "OneWeb":            "OneWeb",
    "Active Satellites": "Active",
}

# Map group name → operator (best-effort default)
GROUP_OPERATOR: dict[str, str | None] = {
    "Space Stations":    None,
    "Space Telescopes":  None,
    "Starlink":          "SpaceX",
    "OneWeb":            "OneWeb",
    "Active Satellites": None,
}


async def fetch_group(group_name: str, url: str) -> list[dict]:
    """Fetch a single CelesTrak group and return the JSON list."""
    async with httpx.AsyncClient(timeout=30, headers=HEADERS) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()


def cache_key(norad_id: int) -> str:
    return f"tle:{norad_id}"


def store_tle_in_cache(sat: dict) -> None:
    """Cache TLE lines for a satellite returned by CelesTrak GP JSON."""
    norad_id = int(sat.get("NORAD_CAT_ID", 0))
    if not norad_id:
        return
    tle_cache.set(
        cache_key(norad_id),
        {
            "name": sat.get("OBJECT_NAME", ""),
            "tle_line1": sat.get("TLE_LINE1", ""),
            "tle_line2": sat.get("TLE_LINE2", ""),
        },
    )


def get_tle(norad_id: int) -> dict | None:
    """Retrieve cached TLE for a NORAD ID. Returns None on cache miss."""
    return tle_cache.get(cache_key(norad_id))


async def refresh_group(group_name: str, db: AsyncSession) -> int:
    """
    Fetch one CelesTrak group, cache all TLEs, and upsert satellite rows.
    Returns number of satellites processed.
    """
    url = CELESTRAK_GROUPS[group_name]
    category = GROUP_CATEGORY[group_name]
    operator = GROUP_OPERATOR[group_name]

    try:
        satellites = await fetch_group(group_name, url)
    except Exception as exc:
        logger.error("CelesTrak fetch failed for %s: %s", group_name, exc)
        return 0

    for sat in satellites:
        store_tle_in_cache(sat)

    # Upsert into DB (update name/category/operator if already exists)
    values = [
        {
            "norad_id": int(sat["NORAD_CAT_ID"]),
            "name": sat.get("OBJECT_NAME", "UNKNOWN"),
            "operator": operator,
            "category": category,
            "is_reflective": True,
            "source": "celestrak",
        }
        for sat in satellites
        if sat.get("NORAD_CAT_ID")
    ]

    if values:
        stmt = pg_insert(Satellite).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["norad_id"],
            set_={
                "name": stmt.excluded.name,
                "category": stmt.excluded.category,
            },
        )
        await db.execute(stmt)
        await db.commit()

    logger.info("CelesTrak [%s]: %d satellites cached/upserted", group_name, len(values))
    return len(values)


async def refresh_all(db: AsyncSession) -> dict[str, int]:
    """Refresh all configured CelesTrak groups. Returns counts per group."""
    results = {}
    for group_name in CELESTRAK_GROUPS:
        count = await refresh_group(group_name, db)
        results[group_name] = count
    return results
