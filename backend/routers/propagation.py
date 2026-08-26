from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime, timezone
from services.propagation import propagate
from services.celestrak import get_tle, refresh_all
from services.cache import tle_cache
from database import AsyncSessionLocal

router = APIRouter(tags=["propagation"])


class PropagateRequest(BaseModel):
    norad_id: int
    timestamp: datetime | None = None  # UTC; defaults to now if omitted


@router.post("/propagate")
async def propagate_satellite(req: PropagateRequest):
    """
    Propagate a satellite to a given UTC time and return its position.
    TLE must already be cached (populated by startup refresh or /api/tle/refresh).
    """
    result = propagate(req.norad_id, at=req.timestamp)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"No cached TLE for NORAD {req.norad_id}. Try calling /api/tle/refresh first.",
        )
    return result


@router.get("/tle/status")
async def tle_cache_status():
    """Return the number of TLEs currently held in the in-memory cache."""
    return {"cached_tle_count": tle_cache.size()}


@router.get("/groundtrack/{norad_id}")
async def get_ground_track(
    norad_id: int,
    steps: int = Query(90, ge=10, le=360, description="Number of track points"),
    step_seconds: int = Query(60, ge=10, le=600, description="Seconds between points"),
):
    """
    Return a ground track: list of lat/lon/alt_km positions propagated forward
    from now at the given step interval. Default: 90 points × 60s = 90 min (one orbit).
    """
    track = ground_track(norad_id, steps=steps, step_seconds=step_seconds)
    if track is None:
        raise HTTPException(
            status_code=404,
            detail=f"No cached TLE for NORAD {norad_id}.",
        )
    return {"norad_id": norad_id, "steps": len(track), "track": track}


@router.post("/tle/refresh")
async def force_tle_refresh(group: str | None = Query(None, description="Specific group name to refresh, or omit for all")):
    """
    Manually trigger a TLE refresh from CelesTrak.
    Useful when the cache has expired or the user requests fresh data.
    """
    from services.celestrak import refresh_group, CELESTRAK_GROUPS
    async with AsyncSessionLocal() as db:
        if group:
            if group not in CELESTRAK_GROUPS:
                raise HTTPException(status_code=400, detail=f"Unknown group '{group}'. Valid groups: {list(CELESTRAK_GROUPS.keys())}")
            count = await refresh_group(group, db)
            return {"refreshed": {group: count}}
        else:
            counts = await refresh_all(db)
            return {"refreshed": counts}
