import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from apps.api.core.config import settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db():
    async with SessionLocal() as session:
        yield session


async def init_db():
    from apps.api import models  # noqa: F401  (ensures models are registered)

    try:
        async with engine.begin() as conn:
            await conn.run_sync(lambda sync_conn: sync_conn.execute(
                __import__("sqlalchemy").text("CREATE EXTENSION IF NOT EXISTS postgis")
            ))
            await conn.run_sync(Base.metadata.create_all)
            await conn.run_sync(lambda sync_conn: sync_conn.execute(
                __import__("sqlalchemy").text("ALTER TABLE scenes ADD COLUMN IF NOT EXISTS embedding_indexed BOOLEAN DEFAULT FALSE")
            ))
    except Exception as exc:
        logger.warning("Database bootstrap skipped because the Postgres/PostGIS service is unavailable: %s", exc)
        # Leave the API available in degraded mode; routes that need a database
        # should return an empty list / safe error instead of crashing the app.

