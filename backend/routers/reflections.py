from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import ReflectionEvent

router = APIRouter(tags=["reflections"])


@router.get("/reflections")
async def get_reflections(
    telescope_id: str | None = Query(None),
    norad_id: int | None = Query(None),
    start: str | None = Query(None, description="ISO 8601 UTC start time"),
    end: str | None = Query(None, description="ISO 8601 UTC end time"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ReflectionEvent)
    if telescope_id:
        stmt = stmt.where(ReflectionEvent.telescope_id == telescope_id.upper())
    if norad_id:
        stmt = stmt.where(ReflectionEvent.norad_id == norad_id)
    if start:
        stmt = stmt.where(ReflectionEvent.event_time >= start)
    if end:
        stmt = stmt.where(ReflectionEvent.event_time <= end)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "norad_id": r.norad_id,
            "telescope_id": r.telescope_id,
            "event_time": r.event_time,
            "duration_s": r.duration_s,
            "angle_deg": r.angle_deg,
        }
        for r in rows
    ]
