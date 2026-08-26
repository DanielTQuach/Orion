"""
Seed script — Phase 1
Inserts a small set of known satellites and a handful of IAU telescopes
to prove the schema. Run once:  python seed.py
"""
import asyncio
import sys
import os

# Add backend root to path
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text
from models import Base, Satellite, Telescope

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://orion:orion@localhost:5432/orion")

SATELLITES = [
    {"norad_id": 20580, "name": "HUBBLE SPACE TELESCOPE", "operator": "NASA", "category": "Space Telescope", "is_reflective": True, "source": "celestrak"},
    {"norad_id": 50463, "name": "JAMES WEBB SPACE TELESCOPE", "operator": "NASA/ESA/CSA", "category": "Space Telescope", "is_reflective": True, "source": "horizons"},
    {"norad_id": 25544, "name": "ISS (ZARYA)", "operator": "Multi-national", "category": "Space Station", "is_reflective": True, "source": "celestrak"},
    {"norad_id": 48274, "name": "STARLINK-2688", "operator": "SpaceX", "category": "Starlink", "is_reflective": True, "source": "celestrak"},
    {"norad_id": 44713, "name": "ONEWEB-0008", "operator": "OneWeb", "category": "OneWeb", "is_reflective": True, "source": "celestrak"},
]

# Subset of IAU observatory codes (code, name, lat, lon, alt_m)
TELESCOPES = [
    ("000", "Greenwich", 51.4769, 0.0005, 65.8),
    ("010", "Uccle", 50.7978, 4.3581, 105.0),
    ("099", "Reedy Creek Observatory", -28.1167, 153.3667, 40.0),
    ("260", "U.S. Naval Observatory, Washington", 38.9214, -77.0672, 92.0),
    ("309", "Cerro Paranal", -24.6275, -70.4044, 2635.0),
    ("500", "Geocentric (Placeholder)", 0.0, 0.0, 0.0),
    ("568", "Mauna Kea", 19.8206, -155.4681, 4205.0),
    ("675", "Palomar Mountain", 33.3558, -116.8636, 1706.0),
    ("703", "Catalina Sky Survey", 32.4164, -110.7313, 2510.0),
    ("950", "La Palma, Canary Islands", 28.7603, -17.8796, 2332.0),
]


async def seed():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        # Satellites
        for s in SATELLITES:
            existing = await session.get(Satellite, s["norad_id"])
            if not existing:
                session.add(Satellite(**s))
                print(f"  + Satellite: {s['name']}")
            else:
                print(f"  ~ Satellite already exists: {s['name']}")

        # Telescopes
        for code, name, lat, lon, alt in TELESCOPES:
            existing = await session.get(Telescope, code)
            if not existing:
                session.add(Telescope(telescope_id=code, name=name, lat=lat, lon=lon, alt_m=alt))
                print(f"  + Telescope: {code} {name}")
            else:
                print(f"  ~ Telescope already exists: {code} {name}")

        await session.commit()

    await engine.dispose()
    print("\nSeed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
