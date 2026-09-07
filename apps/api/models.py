import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.core.db import Base


def uuid_pk():
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class AOI(Base):
    __tablename__ = "aois"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(255))
    geometry = mapped_column(Geometry(geometry_type="POLYGON", srid=4326))
    max_cloud_cover: Mapped[float] = mapped_column(Float, default=20.0)
    monitoring_enabled: Mapped[bool] = mapped_column(default=False)
    monitoring_frequency_days: Mapped[int] = mapped_column(Integer, default=5)
    last_processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    scenes: Mapped[list["Scene"]] = relationship(back_populates="aoi")


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[uuid.UUID] = uuid_pk()
    aoi_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("aois.id"))
    product_id: Mapped[str] = mapped_column(String(255), unique=True)
    sensor: Mapped[str] = mapped_column(String(50))  # e.g. SENTINEL-2
    acquisition_time: Mapped[datetime] = mapped_column(DateTime)
    cloud_cover: Mapped[float] = mapped_column(Float, nullable=True)
    footprint = mapped_column(Geometry(geometry_type="POLYGON", srid=4326))
    crs: Mapped[str] = mapped_column(String(50), default="EPSG:4326")
    gsd_meters: Mapped[float] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(100), default="copernicus_dataspace")
    processing_version: Mapped[str] = mapped_column(String(50), default="v1")
    raw_asset_ref: Mapped[str] = mapped_column(Text, nullable=True)
    local_path: Mapped[str] = mapped_column(Text, nullable=True)
    checksum: Mapped[str] = mapped_column(String(128), nullable=True)
    ingestion_state: Mapped[str] = mapped_column(String(30), default="DISCOVERED")
    # DISCOVERED, QUEUED, DOWNLOADING, PROCESSING, INDEXED, FAILED, REJECTED_LOW_QUALITY
    embedding_indexed: Mapped[bool] = mapped_column(default=False)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    aoi: Mapped["AOI"] = relationship(back_populates="scenes")
    tiles: Mapped[list["Tile"]] = relationship(back_populates="scene")
    quality_report: Mapped["QualityReport | None"] = relationship(back_populates="scene", uselist=False)


class QualityReport(Base):
    __tablename__ = "quality_reports"

    id: Mapped[uuid.UUID] = uuid_pk()
    scene_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scenes.id"), unique=True)
    cloud_coverage: Mapped[float] = mapped_column(Float)
    valid_pixel_ratio: Mapped[float] = mapped_column(Float)
    nodata_ratio: Mapped[float] = mapped_column(Float)
    resolution_ok: Mapped[bool] = mapped_column(default=True)
    geospatial_valid: Mapped[bool] = mapped_column(default=True)
    quality_score: Mapped[float] = mapped_column(Float)  # 0..1
    status: Mapped[str] = mapped_column(String(20))  # GOOD, DEGRADED, UNUSABLE
    reasons: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    scene: Mapped["Scene"] = relationship(back_populates="quality_report")


class Tile(Base):
    __tablename__ = "tiles"

    id: Mapped[uuid.UUID] = uuid_pk()
    scene_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scenes.id"))
    aoi_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("aois.id"))
    bbox = mapped_column(Geometry(geometry_type="POLYGON", srid=4326))
    timestamp: Mapped[datetime] = mapped_column(DateTime)
    resolution_meters: Mapped[float] = mapped_column(Float)
    quality_score: Mapped[float] = mapped_column(Float, nullable=True)
    storage_path: Mapped[str] = mapped_column(Text)
    embedding_id: Mapped[str] = mapped_column(String(100), nullable=True)
    processing_version: Mapped[str] = mapped_column(String(50), default="v1")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    scene: Mapped["Scene"] = relationship(back_populates="tiles")


class ChangeEvent(Base):
    __tablename__ = "change_events"

    id: Mapped[uuid.UUID] = uuid_pk()
    aoi_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("aois.id"))
    geometry = mapped_column(Geometry(geometry_type="POLYGON", srid=4326))
    earliest_supported_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    latest_confirmed_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    change_type: Mapped[str] = mapped_column(String(50))
    change_score: Mapped[float] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float)
    quality_score: Mapped[float] = mapped_column(Float)
    supporting_observations: Mapped[dict] = mapped_column(JSONB, default=list)
    source_scenes: Mapped[dict] = mapped_column(JSONB, default=list)
    model_version: Mapped[str] = mapped_column(String(50))
    processing_version: Mapped[str] = mapped_column(String(50), default="v1")
    analyst_status: Mapped[str] = mapped_column(String(30), default="NEW")
    # NEW, UNDER_REVIEW, CONFIRMED, REJECTED, INCONCLUSIVE
    evidence_category: Mapped[str] = mapped_column(String(30), default="INSUFFICIENT_EVIDENCE")
    # LIKELY_TRUE_CHANGE, POSSIBLE_CHANGE, LIKELY_FALSE_CHANGE, INSUFFICIENT_EVIDENCE
    analyst_note: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ChangeObservation(Base):
    __tablename__ = "change_observations"

    id: Mapped[uuid.UUID] = uuid_pk()
    change_event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("change_events.id"))
    scene_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scenes.id"))
    observed_at: Mapped[datetime] = mapped_column(DateTime)
    change_probability: Mapped[float] = mapped_column(Float, nullable=True)
    quality_status: Mapped[str] = mapped_column(String(20))
    observation_status: Mapped[str] = mapped_column(String(20))
    # NONE, POSSIBLE, CONFIRMED, EXCLUDED
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"

    id: Mapped[uuid.UUID] = uuid_pk()
    aoi_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("aois.id"))
    status: Mapped[str] = mapped_column(String(30), default="QUEUED")
    scenes_found: Mapped[int] = mapped_column(Integer, default=0)
    scenes_ingested: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
