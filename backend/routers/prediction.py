"""
Prediction endpoint — pre-computes reflection windows for the next N hours
and stores them in reflection_events for timeline display.
Paginated to avoid timing out on large satellite sets.
"""
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Satellite
from services.reflection_scan import scan_window
from services.cache import tle_cache
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["prediction"])


class PredictRequest(BaseModel):
    telescope_id: str
    hours_ahead: float = 24.0
    step_seconds: int  = 120     # 2-min resolution for 24hr window
    threshold_deg: float = 1.0
    norad_ids: list[int] | None = None


async def _run_prediction(
    telescope_id: str,
    norad_ids: list[int],
    hours_ahead: float,
    step_seconds: int,
    threshold_deg: float,
) -> None:
    """Background task — runs the scan and persists results."""
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        start = datetime.now(timezone.utc)
        end   = start + timedelta(hours=hours_ahead)
        events = await scan_window(
            telescope_id  = telescope_id,
            norad_ids     = norad_ids,
            start         = start,
            end           = end,
            step_seconds  = step_seconds,
            threshold_deg = threshold_deg,
            db            = db,
        )
        logger.info("Prediction job done: %d events for %s", len(events), telescope_id)


@router.post("/predict")
async def predict_reflections(
    req: PredictRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Kick off a background prediction job for the next N hours.
    Returns immediately — results land in /api/reflections as they compute.
    """
    if req.norad_ids:
        norad_ids = req.norad_ids
    else:
        result = await db.execute(
            select(Satellite.norad_id).where(Satellite.is_reflective == True)
        )
        all_ids = [row[0] for row in result.all()]
        norad_ids = [nid for nid in all_ids if tle_cache.get(f"tle:{nid}") is not None]

    if not norad_ids:
        raise HTTPException(
            status_code=422,
            detail="No satellites with cached TLEs. Call POST /api/tle/refresh first.",
        )

    background_tasks.add_task(
        _run_prediction,
        req.telescope_id.upper(),
        norad_ids,
        req.hours_ahead,
        req.step_seconds,
        req.threshold_deg,
    )

    return {
        "status":       "started",
        "telescope_id": req.telescope_id.upper(),
        "norad_count":  len(norad_ids),
        "hours_ahead":  req.hours_ahead,
        "message":      "Prediction running in background. Poll GET /api/reflections for results.",
    }
