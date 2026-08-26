from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Telescope, Satellite
from services.geometry import geodetic_to_ecef
from services.celestrak import get_tle
from services.propagation import propagate
from services.cache import tle_cache
import math

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


class TelescopeCreate(BaseModel):
    telescope_id: str
    name: str
    lat: float
    lon: float
    alt_m: float
    operator: str | None = None


@router.post("/telescopes", status_code=201)
async def create_telescope(body: TelescopeCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.get(Telescope, body.telescope_id.upper())
    if existing:
        raise HTTPException(status_code=409, detail="Telescope ID already exists")
    tel = Telescope(
        telescope_id = body.telescope_id.upper(),
        name         = body.name,
        lat          = body.lat,
        lon          = body.lon,
        alt_m        = body.alt_m,
        operator     = body.operator,
    )
    db.add(tel)
    await db.commit()
    return {"telescope_id": tel.telescope_id, "name": tel.name}


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


@router.get("/telescopes/{telescope_id}/nearby")
async def get_nearby_satellites(
    telescope_id: str,
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the closest satellites to a telescope, sorted by 3D distance (km).
    Only satellites with a cached TLE are included.
    """
    tel = await db.get(Telescope, telescope_id.upper())
    if not tel:
        raise HTTPException(status_code=404, detail="Telescope not found")

    tel_ecef = geodetic_to_ecef(tel.lat, tel.lon, tel.alt_m)

    # Get all satellites that have a cached TLE
    result = await db.execute(select(Satellite))
    satellites = result.scalars().all()

    nearby = []
    for sat in satellites:
        if not tle_cache.get(f"tle:{sat.norad_id}"):
            continue
        pos = propagate(sat.norad_id)
        if not pos:
            continue
        dx = pos["x_km"] - tel_ecef[0]
        dy = pos["y_km"] - tel_ecef[1]
        dz = pos["z_km"] - tel_ecef[2]
        dist_km = math.sqrt(dx**2 + dy**2 + dz**2)
        nearby.append({
            "norad_id":    sat.norad_id,
            "name":        sat.name,
            "category":    sat.category,
            "operator":    sat.operator,
            "lat":         pos["lat"],
            "lon":         pos["lon"],
            "alt_km":      pos["alt_km"],
            "distance_km": round(dist_km, 1),
        })

    nearby.sort(key=lambda x: x["distance_km"])
    return {"telescope_id": telescope_id.upper(), "satellites": nearby[:limit]}
