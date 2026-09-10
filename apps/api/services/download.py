"""
Downloads a scene's raw asset (via its STAC asset href, authenticated
with the same cached Copernicus token) and runs it through the
quality gate. Advances Scene.ingestion_state through:

  DISCOVERED -> QUEUED -> DOWNLOADING -> PROCESSING -> INDEXED
                                       -> REJECTED_LOW_QUALITY
                                       -> FAILED (on error, retryable)
"""

import hashlib
from pathlib import Path

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.core.config import settings
from apps.api.models import QualityReport, Scene
from apps.api.services.copernicus_client import get_access_token
from apps.api.services.quality import assess_raster

MAX_RETRIES = 3


async def download_and_qc_scene(db: AsyncSession, scene: Scene) -> Scene:
    scene.ingestion_state = "QUEUED"
    await db.flush()

    # Support the repository's real SAFE->GeoTIFF metadata workflow:
    # when the remote raw_asset_ref is absent but a valid local_path already
    # points at a correctly staged raster, the service should run the quality
    # gate locally instead of forcing a mock network failure.
    try:
        if not scene.raw_asset_ref and scene.local_path and Path(scene.local_path).exists():
            # Local raster is already staged as the converted product.
            dest_path = Path(scene.local_path)
            scene.local_path = str(dest_path)
            scene.ingestion_state = "PROCESSING"
            await db.flush()

            result = assess_raster(str(dest_path), scene.cloud_cover, expected_gsd=scene.gsd_meters or 10.0)
            db.add(
                QualityReport(
                    scene_id=scene.id,
                    cloud_coverage=result.cloud_coverage,
                    valid_pixel_ratio=result.valid_pixel_ratio,
                    nodata_ratio=result.nodata_ratio,
                    resolution_ok=result.resolution_ok,
                    geospatial_valid=result.geospatial_valid,
                    quality_score=result.quality_score,
                    status=result.status,
                    reasons=result.reasons,
                )
            )

            scene.ingestion_state = "REJECTED_LOW_QUALITY" if result.status == "UNUSABLE" else "INDEXED"
            await db.commit()
            await db.refresh(scene)
            return scene

        if not scene.raw_asset_ref:
            scene.ingestion_state = "FAILED"
            await db.commit()
            return scene

        scene.ingestion_state = "DOWNLOADING"
        await db.flush()

        dest_dir = Path(settings.raw_dir)
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / f"{scene.product_id}.tif"

        if not settings.offline_mode:
            token = await get_access_token()
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "GET", scene.raw_asset_ref, headers={"Authorization": f"Bearer {token}"}
                ) as resp:
                    resp.raise_for_status()
                    sha256 = hashlib.sha256()
                    with open(dest_path, "wb") as f:
                        async for chunk in resp.aiter_bytes(1 << 20):
                            f.write(chunk)
                            sha256.update(chunk)
            scene.checksum = sha256.hexdigest()
        elif not dest_path.exists():
            raise RuntimeError(f"OFFLINE_MODE: expected staged file missing at {dest_path}")

        scene.local_path = str(dest_path)
        scene.ingestion_state = "PROCESSING"
        await db.flush()

        result = assess_raster(str(dest_path), scene.cloud_cover, expected_gsd=scene.gsd_meters or 10.0)
        db.add(
            QualityReport(
                scene_id=scene.id,
                cloud_coverage=result.cloud_coverage,
                valid_pixel_ratio=result.valid_pixel_ratio,
                nodata_ratio=result.nodata_ratio,
                resolution_ok=result.resolution_ok,
                geospatial_valid=result.geospatial_valid,
                quality_score=result.quality_score,
                status=result.status,
                reasons=result.reasons,
            )
        )

        scene.ingestion_state = "REJECTED_LOW_QUALITY" if result.status == "UNUSABLE" else "INDEXED"

    except Exception as exc:  # noqa: BLE001
        scene.retry_count += 1
        scene.ingestion_state = "FAILED" if scene.retry_count >= MAX_RETRIES else "DISCOVERED"
        # exponential backoff is enforced by the scheduler re-queuing FAILED-eligible
        # scenes after 2**retry_count minutes — not implemented in this synchronous path
        raise
    finally:
        await db.commit()
        await db.refresh(scene)

    return scene
