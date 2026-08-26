from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Satellite

router = APIRouter(tags=["satellites"])


@router.get("/satellites")
async def list_satellites(
    category: str | None = Query(None),
    operator: str | None = Query(None),
    is_reflective: bool | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Satellite)
    if category:
        stmt = stmt.where(Satellite.category == category)
    if operator:
        stmt = stmt.where(Satellite.operator == operator)
    if is_reflective is not None:
        stmt = stmt.where(Satellite.is_reflective == is_reflective)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        {
            "norad_id": s.norad_id,
            "name": s.name,
            "operator": s.operator,
            "category": s.category,
            "is_reflective": s.is_reflective,
            "source": s.source,
        }
        for s in rows
    ]


@router.get("/satellites/{norad_id}")
async def get_satellite(norad_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Satellite).where(Satellite.norad_id == norad_id))
    sat = result.scalar_one_or_none()
    if not sat:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Satellite not found")
    return sat
