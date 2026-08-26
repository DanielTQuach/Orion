from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Telescope

router = APIRouter(tags=["telescopes"])


@router.get("/telescopes")
async def list_telescopes(
    search: str | None = Query(None, description="Search by name or ID"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Telescope)
    if search:
        pattern = f"%{search.upper()}%"
        stmt = stmt.where(
            Telescope.telescope_id.ilike(pattern) | Telescope.name.ilike(pattern)
        )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        {
            "telescope_id": t.telescope_id,
            "name": t.name,
            "lat": t.lat,
            "lon": t.lon,
            "alt_m": t.alt_m,
            "operator": t.operator,
        }
        for t in rows
    ]


@router.get("/telescopes/{telescope_id}")
async def get_telescope(telescope_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Telescope).where(Telescope.telescope_id == telescope_id.upper())
    )
    tel = result.scalar_one_or_none()
    if not tel:
        raise HTTPException(status_code=404, detail="Telescope not found")
    return {
        "telescope_id": tel.telescope_id,
        "name": tel.name,
        "lat": tel.lat,
        "lon": tel.lon,
        "alt_m": tel.alt_m,
        "operator": tel.operator,
    }
