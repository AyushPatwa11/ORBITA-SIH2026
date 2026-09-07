import uuid
from datetime import datetime

from shapely.geometry import shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models import AOI, IngestionJob, Scene
from apps.api.services.copernicus_client import search_catalog


async def run_ingestion_for_aoi(db: AsyncSession, aoi: AOI) -> IngestionJob:
    job = IngestionJob(aoi_id=aoi.id, status="RUNNING")
    db.add(job)
    await db.flush()

    try:
        bbox = _polygon_wkb_to_bbox(aoi)
        date_from = (aoi.last_processed_at or datetime(2023, 1, 1)).strftime("%Y-%m-%dT00:00:00Z")
        date_to = datetime.utcnow().strftime("%Y-%m-%dT00:00:00Z")

        features = await search_catalog(
            bbox=bbox,
            date_from=date_from,
            date_to=date_to,
            max_cloud_cover=aoi.max_cloud_cover,
        )
        job.scenes_found = len(features)

        ingested = 0
        for feature in features:
            product_id = feature["id"]
            existing = await db.execute(select(Scene).where(Scene.product_id == product_id))
            if existing.scalar_one_or_none():
                continue  # already known — incremental ingestion, no full rebuild

            props = feature.get("properties", {})
            geom = shape(feature["geometry"])
            scene = Scene(
                id=uuid.uuid4(),
                aoi_id=aoi.id,
                product_id=product_id,
                sensor=props.get("platform", "SENTINEL-2"),
                acquisition_time=datetime.fromisoformat(props["datetime"].replace("Z", "+00:00")),
                cloud_cover=props.get("eo:cloud_cover"),
                footprint=f"SRID=4326;{geom.wkt}",
                gsd_meters=props.get("gsd", 10.0),
                raw_asset_ref=feature.get("assets", {}).get("PRODUCT", {}).get("href"),
                ingestion_state="DISCOVERED",
            )
            db.add(scene)
            ingested += 1

        job.scenes_ingested = ingested
        job.status = "COMPLETED"
        aoi.last_processed_at = datetime.utcnow()
    except Exception as exc:  # noqa: BLE001
        job.status = "FAILED"
        job.error = str(exc)
    finally:
        job.finished_at = datetime.utcnow()

    await db.commit()
    await db.refresh(job)
    return job


def _polygon_wkb_to_bbox(aoi: AOI) -> list[float]:
    from geoalchemy2.shape import to_shape

    geom = to_shape(aoi.geometry)
    minx, miny, maxx, maxy = geom.bounds
    return [minx, miny, maxx, maxy]
