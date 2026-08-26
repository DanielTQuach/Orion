"""
NASA JPL Horizons ephemeris client.
Used for high-value targets like JWST that aren't well-served by TLEs.

REST API docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html
"""
import httpx
import logging
from services.cache import tle_cache

logger = logging.getLogger(__name__)

HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"

# Known Horizons target IDs for objects we track
HORIZONS_TARGETS: dict[str, dict] = {
    "JWST": {
        "norad_id": 50463,
        "target": "-170",       # Horizons ID for JWST
        "name": "JAMES WEBB SPACE TELESCOPE",
    },
}


def _horizons_cache_key(target_id: str) -> str:
    return f"horizons:{target_id}"


async def fetch_horizons_vectors(
    target: str,
    start_time: str = "NOW",
    stop_time: str = "NOW+1h",
    step: str = "1m",
) -> dict | None:
    """
    Fetch state vectors (position + velocity) from JPL Horizons for a target.
    Returns parsed JSON response or None on error.

    target: Horizons target ID string (e.g. "-170" for JWST)
    start_time / stop_time: Horizons time strings ("NOW", "2025-01-01", etc.)
    step: step size ("1m", "5m", "1h")
    """
    params = {
        "format": "json",
        "COMMAND": f"'{target}'",
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "VECTORS",
        "CENTER": "500@399",    # Earth centre
        "START_TIME": start_time,
        "STOP_TIME": stop_time,
        "STEP_SIZE": step,
        "VEC_TABLE": "2",       # position + velocity
        "REF_PLANE": "FRAME",
        "REF_SYSTEM": "ICRF",
        "VEC_CORR": "NONE",
        "OUT_UNITS": "KM-S",
        "CSV_FORMAT": "NO",
    }

    cached = tle_cache.get(_horizons_cache_key(target))
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(HORIZONS_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
            tle_cache.set(_horizons_cache_key(target), data)
            logger.info("Horizons fetch OK for target %s", target)
            return data
    except Exception as exc:
        logger.error("Horizons fetch failed for %s: %s", target, exc)
        return None


async def refresh_all_horizons_targets() -> dict[str, bool]:
    """Refresh cached Horizons data for all known targets."""
    results = {}
    for name, info in HORIZONS_TARGETS.items():
        data = await fetch_horizons_vectors(info["target"])
        results[name] = data is not None
    return results
