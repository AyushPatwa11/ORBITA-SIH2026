import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.core.db import get_db
from apps.api.models import AOI, Scene
from apps.api.schemas import IngestionTriggerOut, SceneOut
from apps.api.services.ingestion import (
    register_scene_from_metadata_sidecar,
    run_ingestion_for_aoi,
)
from apps.api.services.preview import render_rgb_preview

router = APIRouter(tags=["scenes"])


@router.post("/aois/{aoi_id}/ingest", response_model=IngestionTriggerOut)
async def trigger_ingestion(aoi_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    aoi = await db.get(AOI, aoi_id)
    if not aoi:
        raise HTTPException(404, "AOI not found")

    job = await run_ingestion_for_aoi(db, aoi)
    if job.status == "FAILED":
        raise HTTPException(500, f"Ingestion failed: {job.error}")

    return IngestionTriggerOut(
        job_id=job.id, aoi_id=aoi_id, status=job.status, scenes_found=job.scenes_found
    )


@router.post("/aois/{aoi_id}/register-from-sidecar")
async def register_from_sidecar(
    aoi_id: uuid.UUID,
    metadata_path: str = Body(..., embed=False),
    db: AsyncSession = Depends(get_db),
):
    aoi = await db.get(AOI, aoi_id)
    if not aoi:
        raise HTTPException(404, "AOI not found")

    scene = await register_scene_from_metadata_sidecar(db, aoi_id, metadata_path)
    return {
        "scene_id": str(scene.id),
        "product_id": scene.product_id,
        "sensor": scene.sensor,
        "ingestion_state": scene.ingestion_state,
        "local_path": scene.local_path,
    }


@router.get("/aois/{aoi_id}/scenes", response_model=list[SceneOut])
async def list_scenes(aoi_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Scene).where(Scene.aoi_id == aoi_id).order_by(Scene.acquisition_time.desc())
    )
    return result.scalars().all()


@router.get("/scenes/{scene_id}/preview.png")
async def scene_preview(scene_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    scene = await db.get(Scene, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")
    if not scene.local_path:
        raise HTTPException(409, "Scene has not been downloaded yet — nothing to render")

    try:
        png_bytes = render_rgb_preview(scene.local_path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Failed to render preview: {exc}")

    return Response(content=png_bytes, media_type="image/png")
