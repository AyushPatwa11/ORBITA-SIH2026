import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AOICreate(BaseModel):
    name: str
    geojson_polygon: dict = Field(..., description="GeoJSON Polygon geometry")
    max_cloud_cover: float = 20.0
    monitoring_enabled: bool = False
    monitoring_frequency_days: int = 5


class AOIOut(BaseModel):
    id: uuid.UUID
    name: str
    max_cloud_cover: float
    monitoring_enabled: bool
    created_at: datetime
    geometry: dict | None = None

    model_config = {"from_attributes": True}


class SceneOut(BaseModel):
    id: uuid.UUID
    product_id: str
    sensor: str
    acquisition_time: datetime
    cloud_cover: float | None
    ingestion_state: str
    source: str

    model_config = {"from_attributes": True}


class QualityReportOut(BaseModel):
    scene_id: uuid.UUID
    cloud_coverage: float
    valid_pixel_ratio: float
    nodata_ratio: float
    quality_score: float
    status: str
    reasons: dict

    model_config = {"from_attributes": True}


class IngestionTriggerOut(BaseModel):
    job_id: uuid.UUID
    aoi_id: uuid.UUID
    status: str
    scenes_found: int


class DownloadTriggerOut(BaseModel):
    scene_id: uuid.UUID
    ingestion_state: str
    quality_status: str | None = None
    quality_score: float | None = None


class ChangeDetectRequest(BaseModel):
    aoi_id: uuid.UUID
    before_scene_id: uuid.UUID
    after_scene_id: uuid.UUID


class ChangeEventOut(BaseModel):
    id: uuid.UUID
    aoi_id: uuid.UUID
    change_type: str
    change_score: float
    confidence: float
    quality_score: float
    analyst_status: str
    evidence_category: str
    earliest_supported_date: datetime | None
    model_version: str
    source_scenes: list
    supporting_observations: list = []
    created_at: datetime
    geometry: dict | None = None

    model_config = {"from_attributes": True}


class ReviewRequest(BaseModel):
    status: str  # CONFIRMED, REJECTED, INCONCLUSIVE
    note: str | None = None


class TimelinePointOut(BaseModel):
    scene_id: uuid.UUID
    timestamp: datetime
    quality_status: str
    change_probability: float | None
    observation_status: str

    model_config = {"from_attributes": True}


class TimelineAnalysisOut(BaseModel):
    evidence_category: str
    earliest_supported_date: datetime | None
    seasonal_pattern_detected: bool
    timeline: list[TimelinePointOut]


class DemoSeedOut(BaseModel):
    aoi_id: uuid.UUID
    scene_ids: list[uuid.UUID]
    scenes_created: int
    scenes_rejected_low_quality: int
    note: str


class SearchRequest(BaseModel):
    query: str = ""
    aoi_id: uuid.UUID | None = None
    evidence_category: str | None = None
    min_confidence: float = 0.0
    date_from: datetime | None = None
    date_to: datetime | None = None


class IndexSceneOut(BaseModel):
    scene_id: uuid.UUID
    weights_loaded: bool
    embedding_dim: int


class SemanticSearchRequest(BaseModel):
    query: str
    aoi_id: uuid.UUID | None = None
    k: int = 10


class SimilarSceneOut(BaseModel):
    scene_id: uuid.UUID
    product_id: str
    acquisition_time: datetime
    similarity: float
    weights_loaded: bool
