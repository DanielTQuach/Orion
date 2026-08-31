import logging
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import engine, Base, AsyncSessionLocal
from routers import satellites, telescopes, reflections, propagation, reflection_scan, prediction, fov_scan, rag_pipeline
from services.scheduler import start_scheduler, stop_scheduler
from services.celestrak import refresh_all
from services.horizons import refresh_all_horizons_targets
from services.demo import ensure_demo_catalog, ensure_fallback_tles

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        await ensure_demo_catalog(db)
        seeded = ensure_fallback_tles()
        if seeded:
            logger.info("Fallback TLEs loaded so DEMO nearby/FOV scans work offline")

    async def _refresh_live_catalogs():
        logger.info("Running TLE refresh in background...")
        async with AsyncSessionLocal() as db:
            counts = await refresh_all(db)
            logger.info("Startup TLE refresh: %s", counts)
        await refresh_all_horizons_targets()

    asyncio.create_task(_refresh_live_catalogs())

    # Start background scheduler
    start_scheduler()

    yield

    stop_scheduler()


app = FastAPI(title="Orion API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(satellites.router, prefix="/api")
app.include_router(telescopes.router, prefix="/api")
app.include_router(reflections.router, prefix="/api")
app.include_router(propagation.router, prefix="/api")
app.include_router(reflection_scan.router, prefix="/api")
app.include_router(prediction.router, prefix="/api")
app.include_router(fov_scan.router, prefix="/api")
app.include_router(rag_pipeline.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "orion-api"}
