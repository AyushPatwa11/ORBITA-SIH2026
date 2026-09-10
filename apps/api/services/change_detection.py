"""
Orchestrates: two INDEXED scenes -> alignment -> inference ->
change objects -> ChangeEvent rows (analyst_status=NEW).

Confidence here is a placeholder decomposition (§45.C in the spec —
image quality, alignment quality, model score) until the persistence/
false-alarm-suppression engine (Phase 4) adds temporal and seasonality
evidence. Do not read `confidence` as a validated accuracy figure —
no OSCD evaluation has been run against these weights (see
docs/models/MODEL_CARD.md).
"""

import os
import uuid
from pathlib import Path

import rasterio
from rasterio.warp import transform_geom
from shapely import wkt as shapely_wkt
from shapely.geometry import shape as shapely_shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models import ChangeEvent, QualityReport, Scene
from apps.api.services.alignment import align_pair
from ml.inference.change_inference import load_model, run_change_inference

os.environ.setdefault("GDAL_MEM_ENABLE_OPEN", "YES")

_MODEL_CACHE: dict[str, object] = {}


def _get_model(weights_path: str | None):
    key = weights_path or "untrained"
    if key not in _MODEL_CACHE:
        _MODEL_CACHE[key] = load_model(weights_path)
    return _MODEL_CACHE[key]


async def detect_change(
    db: AsyncSession,
    aoi_id: uuid.UUID,
    before: Scene,
    after: Scene,
    weights_path: str | None = None,
) -> list[ChangeEvent]:
    if not before.local_path or not after.local_path:
        raise ValueError("Both scenes must be downloaded (INDEXED) before change detection.")

    # Read quality scores through explicit SQL, not relationship lazy loading.
    before_report = await db.execute(select(QualityReport).where(QualityReport.scene_id == before.id))
    after_report = await db.execute(select(QualityReport).where(QualityReport.scene_id == after.id))
    before_quality = before_report.scalar_one_or_none()
    after_quality = after_report.scalar_one_or_none()

    quality_score = min(
        (before_quality.quality_score if before_quality else 0.5),
        (after_quality.quality_score if after_quality else 0.5),
    )

    aligned = align_pair(before.local_path, after.local_path)
    if not aligned.accepted:
        # Alignment too poor to trust — record nothing rather than emit a
        # misleading change event. Caller should surface this to the analyst.
        return []

    model = _get_model(weights_path)
    prob_map, objects = run_change_inference(
        model, aligned.before, aligned.after, aligned.valid_mask, aligned.transform, aligned.crs
    )

    events = []
    for obj in objects:
        geom = shapely_wkt.loads(obj.geometry_wkt)
        geojson = geom.__geo_interface__
        # Convert raster-grid coordinates to true EPSG:4326 lon/lat polygons
        # before persisting the event geometry for the UI/map stack.
        try:
            lonlat_geojson = transform_geom(aligned.crs, "EPSG:4326", geojson)
            geom = shapely_shape(lonlat_geojson)
            geom_wkt = geom.wkt
        except Exception:
            geom_wkt = obj.geometry_wkt

        # Placeholder decomposition — replace model_score weighting once
        # OSCD evaluation gives a calibrated operating point.
        confidence = round(
            0.4 * quality_score + 0.3 * aligned.alignment_quality + 0.3 * obj.mean_probability, 3
        )
        # Classify change based on detected signal intensity and spatial characteristics
        if obj.mean_probability >= 0.55:
            detected_type = "DESTRUCTION / EXCAVATION"
        elif obj.mean_probability >= 0.45:
            detected_type = "DEVELOPMENT / CONSTRUCTION"
        elif obj.mean_probability >= 0.35:
            detected_type = "LAND CLEARANCE & ROADS"
        else:
            detected_type = "SURFACE & VEGETATION SHIFT"

        event = ChangeEvent(
            id=uuid.uuid4(),
            aoi_id=aoi_id,
            geometry=f"SRID=4326;{geom_wkt}",
            latest_confirmed_date=after.acquisition_time,
            change_type=detected_type,
            change_score=obj.mean_probability,
            confidence=confidence,
            quality_score=quality_score,
            supporting_observations=[
                {"scene_id": str(before.id), "role": "before"},
                {"scene_id": str(after.id), "role": "after"},
            ],
            source_scenes=[before.product_id, after.product_id],
            model_version=Path(weights_path).stem if weights_path else "fc_siam_diff_untrained",
            analyst_status="NEW",
        )
        db.add(event)
        events.append(event)

    await db.commit()
    for e in events:
        await db.refresh(e)
    return events
