from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import engine, Base
from routers import satellites, telescopes, reflections


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "orion-api"}
