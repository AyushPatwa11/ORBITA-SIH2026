import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2.shape import to_shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

from apps.api.core.db import get_db
from apps.api.models import ChangeEvent, ChangeObservation, Scene
from apps.api.schemas import (
    ChangeDetectRequest,
    ChangeEventOut,
    DownloadTriggerOut,
    ReviewRequest,
    TimelineAnalysisOut,
    TimelinePointOut,
)
from apps.api.services.change_detection import detect_change
from apps.api.services.download import download_and_qc_scene
from apps.api.services.temporal import run_temporal_analysis

router = APIRouter(tags=["change-events"])

VALID_REVIEW_STATUSES = {"CONFIRMED", "REJECTED", "INCONCLUSIVE"}


def _event_to_out(event: ChangeEvent) -> ChangeEventOut:
    geom = to_shape(event.geometry) if event.geometry is not None else None
    return ChangeEventOut(
        id=event.id,
        aoi_id=event.aoi_id,
        change_type=event.change_type,
        change_score=event.change_score,
        confidence=event.confidence,
        quality_score=event.quality_score,
        analyst_status=event.analyst_status,
        evidence_category=event.evidence_category,
        earliest_supported_date=event.earliest_supported_date,
        model_version=event.model_version,
        source_scenes=event.source_scenes,
        supporting_observations=event.supporting_observations,
        created_at=event.created_at,
        geometry=geom.__geo_interface__ if geom else None,
    )


@router.post("/scenes/{scene_id}/download", response_model=DownloadTriggerOut)
async def download_scene(scene_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    scene = await db.get(Scene, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")

    scene = await download_and_qc_scene(db, scene)
    return DownloadTriggerOut(
        scene_id=scene.id,
        ingestion_state=scene.ingestion_state,
        quality_status=scene.quality_report.status if scene.quality_report else None,
        quality_score=scene.quality_report.quality_score if scene.quality_report else None,
    )


@router.post("/change-events/detect", response_model=list[ChangeEventOut])
async def trigger_change_detection(payload: ChangeDetectRequest, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(Scene)
            .where(Scene.id.in_([payload.before_scene_id, payload.after_scene_id]))
            .options(selectinload(Scene.quality_report))
        )
        scenes = {str(scene.id): scene for scene in result.scalars().all()}

        before = scenes.get(str(payload.before_scene_id))
        after = scenes.get(str(payload.after_scene_id))
        if not before or not after:
            raise HTTPException(404, "One or both scenes not found")
        if before.ingestion_state != "INDEXED" or after.ingestion_state != "INDEXED":
            raise HTTPException(
                409, "Both scenes must be INDEXED (downloaded + quality-passed) before detection."
            )

        try:
            events = await detect_change(db, payload.aoi_id, before, after)
        except ValueError as exc:
            raise HTTPException(400, str(exc))

        return [_event_to_out(e) for e in events]
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Change detection failed because the DB service is unavailable: %s", exc)
        raise HTTPException(503, "Satellite analysis could not start because the database service is unavailable.") from exc


@router.get("/change-events", response_model=list[ChangeEventOut])
async def list_change_events(aoi_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    try:
        query = select(ChangeEvent).order_by(ChangeEvent.created_at.desc())
        if aoi_id:
            query = query.where(ChangeEvent.aoi_id == aoi_id)
        result = await db.execute(query)
        return [_event_to_out(e) for e in result.scalars().all()]
    except Exception as exc:
        logger.warning("Change event listing failed because the DB service is unavailable: %s", exc)
        return []


@router.post("/change-events/{event_id}/review", response_model=ChangeEventOut)
async def review_change_event(
    event_id: uuid.UUID, payload: ReviewRequest, db: AsyncSession = Depends(get_db)
):
    if payload.status not in VALID_REVIEW_STATUSES:
        raise HTTPException(400, f"status must be one of {VALID_REVIEW_STATUSES}")

    event = await db.get(ChangeEvent, event_id)
    if not event:
        raise HTTPException(404, "Change event not found")

    event.analyst_status = payload.status
    event.analyst_note = payload.note
    await db.commit()
    await db.refresh(event)
    return _event_to_out(event)


@router.post("/change-events/{event_id}/analyze-timeline", response_model=TimelineAnalysisOut)
async def analyze_timeline(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    event = await db.get(ChangeEvent, event_id)
    if not event:
        raise HTTPException(404, "Change event not found")

    try:
        result = await run_temporal_analysis(db, event)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    return result


@router.get("/change-events/{event_id}/timeline", response_model=list[TimelinePointOut])
async def get_stored_timeline(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChangeObservation)
        .where(ChangeObservation.change_event_id == event_id)
        .order_by(ChangeObservation.observed_at.asc())
    )
    rows = result.scalars().all()
    return [
        TimelinePointOut(
            scene_id=r.scene_id,
            timestamp=r.observed_at,
            quality_status=r.quality_status,
            change_probability=r.change_probability,
            observation_status=r.observation_status,
        )
        for r in rows
    ]
