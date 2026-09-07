"""
Structured search over change events: keyword substring match against
change_type/analyst_note plus metadata filters (AOI, evidence category,
confidence floor, date range). This is NOT semantic image retrieval — no
embedding model is selected yet (see docs/models/MODEL_SELECTION.md). It
is the explicit fallback the spec allows when that's the case: structured
query parsing + metadata constraints instead of pretending a generic model
understands image content.
"""

from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2.shape import to_shape
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.core.db import get_db
from apps.api.models import ChangeEvent, Scene
from apps.api.schemas import (
    ChangeEventOut,
    IndexSceneOut,
    SearchRequest,
    SemanticSearchRequest,
    SimilarSceneOut,
)
from apps.api.services.embeddings import find_similar_scenes, index_scene, semantic_search

router = APIRouter(tags=["search"])


@router.post("/search/change-events", response_model=list[ChangeEventOut])
async def search_change_events(payload: SearchRequest, db: AsyncSession = Depends(get_db)):
    query = select(ChangeEvent).order_by(ChangeEvent.confidence.desc())

    if payload.aoi_id:
        query = query.where(ChangeEvent.aoi_id == payload.aoi_id)
    if payload.evidence_category:
        query = query.where(ChangeEvent.evidence_category == payload.evidence_category)
    if payload.min_confidence:
        query = query.where(ChangeEvent.confidence >= payload.min_confidence)
    if payload.date_from:
        query = query.where(ChangeEvent.created_at >= payload.date_from)
    if payload.date_to:
        query = query.where(ChangeEvent.created_at <= payload.date_to)

    keyword = payload.query.strip()
    if keyword:
        like = f"%{keyword}%"
        query = query.where(
            or_(ChangeEvent.change_type.ilike(like), ChangeEvent.analyst_note.ilike(like))
        )

    result = await db.execute(query)
    events = result.scalars().all()

    out = []
    for e in events:
        geom = to_shape(e.geometry) if e.geometry is not None else None
        out.append(
            ChangeEventOut(
                id=e.id,
                aoi_id=e.aoi_id,
                change_type=e.change_type,
                change_score=e.change_score,
                confidence=e.confidence,
                quality_score=e.quality_score,
                analyst_status=e.analyst_status,
                evidence_category=e.evidence_category,
                earliest_supported_date=e.earliest_supported_date,
                model_version=e.model_version,
                source_scenes=e.source_scenes,
                supporting_observations=e.supporting_observations,
                created_at=e.created_at,
                geometry=geom.__geo_interface__ if geom else None,
            )
        )
    return out


@router.post("/scenes/{scene_id}/index", response_model=IndexSceneOut)
async def index_scene_endpoint(scene_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    scene = await db.get(Scene, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")
    try:
        result = await index_scene(db, scene)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    return result


@router.post("/search/semantic", response_model=list[SimilarSceneOut])
async def semantic_search_endpoint(payload: SemanticSearchRequest, db: AsyncSession = Depends(get_db)):
    results = await semantic_search(
        db, payload.query, payload.k, str(payload.aoi_id) if payload.aoi_id else None
    )
    return results


@router.post("/scenes/{scene_id}/similar", response_model=list[SimilarSceneOut])
async def similar_scenes_endpoint(
    scene_id: uuid.UUID, k: int = 6, db: AsyncSession = Depends(get_db)
):
    scene = await db.get(Scene, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")
    if not scene.local_path:
        raise HTTPException(409, "Scene has not been downloaded yet.")
    return await find_similar_scenes(db, scene, k)
