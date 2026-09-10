import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from geoalchemy2.shape import to_shape
from shapely.geometry import shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models import AOI, IngestionJob, Scene
from apps.api.services.copernicus_client import search_catalog


def parse_metadata_sidecar(path: str | Path) -> dict:
    """Read the repository's SAFE->GeoTIFF metadata sidecar and normalize
    it into the fields expected by Scene plus a few quality-control hints.
    """
    obj = json.loads(Path(path).read_text()) if isinstance(path, (str, Path)) else {}
    return {
        "product_id": obj.get("product_id"),
        "sensor": obj.get("sensor", "SENTINEL-2"),
        "source": obj.get("source", "copernicus_dataspace"),
        "processing_version": obj.get("processing_version", "v1"),
        "acquisition_time": obj.get("acquisition_time"),
        "cloud_cover": obj.get("cloud_cover", 0.0),
        "raw_asset_ref": obj.get("raw_asset_ref"),
        "local_path": obj.get("local_path"),
        "gsd_meters": obj.get("gsd_meters", 10.0),
        "crs": obj.get("crs", "EPSG:4326"),
        "ingestion_state": obj.get("ingestion_state", "DISCOVERED"),
        "dataset_format": obj.get("dataset_format", "SAFE->GeoTIFF"),
    }


def _parse_stac_datetime(value: str | datetime) -> datetime:
    """Return a UTC-naive timestamp for DB insertion.

    Copernicus STAC replies carry timezone-aware ISO strings such as
    `...Z`. Some payloads may also reach us already as a `datetime`
    object with a timezone marker. In both forms, the ORM model stores
    a naive `DateTime` and asyncpg rejects the aware payload.
    """
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        raise TypeError(f"Unsupported STAC datetime payload type: {type(value)!r}")

    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed.replace(tzinfo=None)


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
                acquisition_time=_parse_stac_datetime(props["datetime"]),
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
        await db.rollback()
    finally:
        job.finished_at = datetime.utcnow()

    await db.commit()
    await db.refresh(job)
    return job


async def register_scene_from_metadata_sidecar(db: AsyncSession, aoi_id: uuid.UUID, metadata_path: str | Path) -> Scene:
    """Bring a converted SAFE product into the Scene table from the repository
    metadata sidecar, keeping the same fields the rest of the app expects.
    """
    data = parse_metadata_sidecar(metadata_path)
    product_id = data["product_id"]
    existing = await db.execute(select(Scene).where(Scene.product_id == product_id))
    scene = existing.scalar_one_or_none()
    if scene:
        return scene

    acquisition_time = data.get("acquisition_time")
    if isinstance(acquisition_time, str):
        acquisition_time = datetime.fromisoformat(acquisition_time.replace("Z", "+00:00")).replace(tzinfo=None)

    # The metadata file carries a synthetic or simplified footprint in the
    # current repo artifact, but the model is geometry-as-Polygon and expects
    # a polygon in EPSG:4326 text from the real source. Map the converter's
    # AOI polygon into the row if we can compute it, otherwise use the
    # safe route of the existing AOI geometry on the server side.
    aoi = await db.get(AOI, aoi_id)
    if aoi and aoi.geometry:
        geom = to_shape(aoi.geometry)
        footprint = f"SRID=4326;{geom.wkt}"
    else:
        footprint = "SRID=4326;POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))"

    scene = Scene(
        id=uuid.uuid4(),
        aoi_id=aoi_id,
        product_id=product_id,
        sensor=data.get("sensor", "SENTINEL-2"),
        acquisition_time=acquisition_time or datetime.utcnow(),
        cloud_cover=data.get("cloud_cover", 0.0),
        footprint=footprint,
        crs=data.get("crs", "EPSG:4326"),
        gsd_meters=data.get("gsd_meters", 10.0),
        source=data.get("source", "copernicus_dataspace"),
        processing_version=data.get("processing_version", "v1"),
        raw_asset_ref=data.get("raw_asset_ref"),
        local_path=data.get("local_path"),
        ingestion_state=data.get("ingestion_state", "DISCOVERED"),
    )
    db.add(scene)
    await db.commit()
    await db.refresh(scene)
    return scene


def _polygon_wkb_to_bbox(aoi: AOI) -> list[float]:
    from geoalchemy2.shape import to_shape

    geom = to_shape(aoi.geometry)
    minx, miny, maxx, maxy = geom.bounds
    return [minx, miny, maxx, maxy]
