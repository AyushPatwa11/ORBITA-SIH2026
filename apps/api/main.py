import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from apps.api.core.config import settings
from apps.api.core.db import init_db
from apps.api.routers import aois, change_events, demo, scenes, search


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="ORBITA",
    description="Semantic Earth Observation & Change Intelligence — Prototype / Demonstration System",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(aois.router)
app.include_router(scenes.router)
app.include_router(change_events.router)
app.include_router(demo.router)
app.include_router(search.router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "offline_mode": settings.offline_mode,
        "environment": settings.environment,
    }
