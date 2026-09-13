import os
import logging
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from apps.api.core.config import settings
from apps.api.core.db import init_db
from apps.api.routers import aois, change_events, demo, location, scenes, search

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    allowed_origins = _cors_origins()
    logger.info("CORS allowed origins: %s", allowed_origins)
    await init_db()
    yield


def _cors_origins() -> list[str]:
    configured = [
        origin.strip().rstrip("/")
        for origin in settings.cors_allowed_origins.split(",")
        if origin.strip()
    ]
    defaults = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        settings.frontend_url,
    ]
    return list(dict.fromkeys(configured + defaults))


app = FastAPI(
    title="ORBITA",
    description="Semantic Earth Observation & Change Intelligence — Prototype / Demonstration System",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(aois.router)
app.include_router(scenes.router)
app.include_router(change_events.router)
app.include_router(demo.router)
app.include_router(search.router)
app.include_router(location.router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "offline_mode": settings.offline_mode,
        "environment": settings.environment,
    }
