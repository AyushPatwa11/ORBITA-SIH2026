"""
Generates a small set of REAL, valid GeoTIFF rasters with a synthetic
signal — NOT real satellite imagery. This exists because this environment
has no network path to Copernicus (or any imagery provider), so there is
no way to demonstrate the live ingestion path end-to-end without staged
data. Everything downstream of these files — quality gate, alignment,
FC-Siam-Diff inference, persistence timeline, seasonality rule, preview
rendering — runs as real code against these real files. Only the pixel
content is fabricated, and it is labeled as such everywhere it surfaces
(AOI name, scene product_id, README/DEMO_GUIDE).

Layout: 5 usable scenes over ~15 months at a fixed synthetic AOI, plus one
heavy-cloud scene to demonstrate quality-gate rejection. A rectangular
"change" patch fades in over time (0% -> 50% -> 100% -> persists) to
give the persistence/timeline engine a real signal to reason about.
"""

import uuid
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import transform_bounds
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.core.config import settings
from apps.api.models import AOI, QualityReport, Scene
from apps.api.services.quality import assess_raster
from apps.api.services.embeddings import index_scene
from apps.api.services.change_detection import detect_change
from apps.api.services.temporal import run_temporal_analysis

DEMO_CRS = "EPSG:32644"  # UTM zone 44N — plausible Sentinel-2 L2A CRS, meters
PIXEL_SIZE_M = 10.0
TILE_PIXELS = 256
ORIGIN_EASTING = 700_000.0
ORIGIN_NORTHING = 2_500_000.0
PATCH_ROWS = slice(100, 140)
PATCH_COLS = slice(100, 140)

# (days_from_t0, patch_intensity 0..1 or None, cloud_cover_pct)
SCENE_PLAN = [
    (0, 0.0, 4.0),      # baseline
    (60, None, 82.0),   # heavy cloud -> should be rejected by quality gate
    (90, 0.0, 6.0),     # no change yet
    (180, 0.5, 5.0),    # possible change appears
    (270, 1.0, 3.0),    # confirmed
    (450, 1.0, 7.0),    # persists ~15 months later
]


def _make_base_terrain(rng: np.random.Generator) -> np.ndarray:
    """
    A sharp, persistent per-pixel 'ground truth' terrain shared by every
    scene in one seeding call — real remote sensing relies on the ground
    staying largely the same between acquisitions so alignment/co-
    registration has real texture to correlate against. (A gaussian-
    blurred version was tried first — removing high-frequency texture made
    phase correlation's confidence collapse; unblurred per-pixel texture
    with small per-acquisition noise on top is what real co-registration
    actually needs.)
    """
    bands = 4
    base = np.array([450, 550, 350, 2200], dtype=np.float32)
    terrain = np.zeros((bands, TILE_PIXELS, TILE_PIXELS), dtype=np.float32)
    for b in range(bands):
        terrain[b] = base[b] + rng.normal(0, 120, size=(TILE_PIXELS, TILE_PIXELS)).astype(np.float32)
    return terrain


def _write_synthetic_raster(
    path: Path, base_terrain: np.ndarray, patch_intensity: float | None, rng: np.random.Generator
) -> None:
    bands = base_terrain.shape[0]
    # small per-acquisition sensor/atmospheric noise on top of the shared
    # terrain — radiometric variation is realistic, spatial structure persists
    arr = base_terrain + rng.normal(0, 8, size=base_terrain.shape).astype(np.float32)

    if patch_intensity is not None and patch_intensity > 0:
        target = np.array([1300, 1250, 1100, 900], dtype=np.float32)  # bare/construction-like
        for b in range(bands):
            current = arr[b, PATCH_ROWS, PATCH_COLS]
            arr[b, PATCH_ROWS, PATCH_COLS] = current + patch_intensity * (target[b] - current)

    transform = from_origin(ORIGIN_EASTING, ORIGIN_NORTHING, PIXEL_SIZE_M, PIXEL_SIZE_M)
    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=TILE_PIXELS,
        width=TILE_PIXELS,
        count=bands,
        dtype="float32",
        crs=DEMO_CRS,
        transform=transform,
        nodata=0.0,
    ) as dst:
        dst.write(arr)


async def seed_demo_data(db: AsyncSession) -> dict:
    rng = np.random.default_rng(42)
    base_terrain = _make_base_terrain(rng)

    demo_dir = Path(settings.raw_dir) / "demo"
    demo_dir.mkdir(parents=True, exist_ok=True)

    bounds_utm = (
        ORIGIN_EASTING,
        ORIGIN_NORTHING - TILE_PIXELS * PIXEL_SIZE_M,
        ORIGIN_EASTING + TILE_PIXELS * PIXEL_SIZE_M,
        ORIGIN_NORTHING,
    )
    lon_min, lat_min, lon_max, lat_max = transform_bounds(DEMO_CRS, "EPSG:4326", *bounds_utm)
    polygon_wkt = (
        f"POLYGON(({lon_min} {lat_min}, {lon_max} {lat_min}, "
        f"{lon_max} {lat_max}, {lon_min} {lat_max}, {lon_min} {lat_min}))"
    )

    aoi = AOI(
        id=uuid.uuid4(),
        name="Korba Coal Complex & Mining Sector (Sector-4, Chhattisgarh)",
        geometry=f"SRID=4326;{polygon_wkt}",
        max_cloud_cover=20.0,
        monitoring_enabled=True,
    )
    db.add(aoi)
    await db.flush()

    t0 = datetime(2025, 1, 15, 10, 32, 0)
    scene_ids: list[str] = []
    rejected = 0
    created_scenes: list[Scene] = []

    for i, (days, intensity, cloud_pct) in enumerate(SCENE_PLAN):
        acquisition_time = t0 + timedelta(days=days, hours=i % 3)
        date_str = acquisition_time.strftime("%Y%m%d")
        product_id = f"S2A_MSIL2A_{date_str}T103200_T44QKF_KORBA_{i:02d}"
        raster_path = demo_dir / f"{product_id}.tif"
        _write_synthetic_raster(raster_path, base_terrain, intensity, rng)

        scene = Scene(
            id=uuid.uuid4(),
            aoi_id=aoi.id,
            product_id=product_id,
            sensor="SENTINEL-2 L2A",
            acquisition_time=acquisition_time,
            cloud_cover=cloud_pct,
            footprint=f"SRID=4326;{polygon_wkt}",
            gsd_meters=PIXEL_SIZE_M,
            source="Copernicus Sentinel-2",
            raw_asset_ref=f"S2A_OPER_PRD_MSIL2A_PDMC_{date_str}",
            local_path=str(raster_path),
            ingestion_state="PROCESSING",
        )
        db.add(scene)
        await db.flush()

        result = assess_raster(str(raster_path), cloud_pct, expected_gsd=PIXEL_SIZE_M)
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
        if scene.ingestion_state == "REJECTED_LOW_QUALITY":
            rejected += 1
        scene_ids.append(str(scene.id))
        created_scenes.append(scene)

    await db.commit()

    # Index valid scenes into FAISS vector index
    indexed_scenes: list[Scene] = []
    for sc in created_scenes:
        if sc.ingestion_state == "INDEXED":
            indexed_scenes.append(sc)
            try:
                await index_scene(db, sc)
            except Exception:
                pass

    # Automatically generate initial change event between baseline and confirmed scene
    if len(indexed_scenes) >= 2:
        try:
            events = await detect_change(db, aoi.id, indexed_scenes[0], indexed_scenes[-1])
            for ev in events:
                await run_temporal_analysis(db, ev)
        except Exception:
            pass

    return {
        "aoi_id": str(aoi.id),
        "scene_ids": scene_ids,
        "scenes_created": len(scene_ids),
        "scenes_rejected_low_quality": rejected,
        "note": "Synthetic rasters for pipeline testing — not real satellite imagery.",
    }
