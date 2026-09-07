"""
Image quality gate. Runs BEFORE any change-detection inference.
Computes a 0..1 quality_score and a GOOD/DEGRADED/UNUSABLE status with
explicit reasons the analyst can inspect (§6 of the spec).
"""

from dataclasses import dataclass, field

import numpy as np
import rasterio


@dataclass
class QualityResult:
    cloud_coverage: float
    valid_pixel_ratio: float
    nodata_ratio: float
    resolution_ok: bool
    geospatial_valid: bool
    quality_score: float
    status: str
    reasons: dict = field(default_factory=dict)


NODATA_REJECT_THRESHOLD = 0.35   # >35% nodata -> unusable
CLOUD_DEGRADE_THRESHOLD = 0.25   # >25% cloud -> degraded
CLOUD_REJECT_THRESHOLD = 0.60    # >60% cloud -> unusable
MIN_VALID_PIXEL_RATIO = 0.5


def assess_raster(path: str, stac_cloud_cover: float | None, expected_gsd: float = 10.0) -> QualityResult:
    reasons: dict[str, str] = {}

    with rasterio.open(path) as src:
        if src.crs is None or src.transform is None:
            geospatial_valid = False
            reasons["geospatial"] = "missing CRS or transform"
        else:
            geospatial_valid = True

        gsd = abs(src.transform.a)
        resolution_ok = gsd <= expected_gsd * 1.5
        if not resolution_ok:
            reasons["resolution"] = f"pixel size {gsd:.1f}m exceeds expected {expected_gsd}m"

        band = src.read(1, masked=True)
        total_px = band.size
        valid_px = int((~band.mask).sum()) if hasattr(band, "mask") else total_px
        nodata_ratio = 1.0 - (valid_px / total_px if total_px else 0)
        valid_pixel_ratio = valid_px / total_px if total_px else 0.0

    cloud_coverage = (stac_cloud_cover or 0.0) / 100.0 if stac_cloud_cover and stac_cloud_cover > 1 else (stac_cloud_cover or 0.0)

    if nodata_ratio > NODATA_REJECT_THRESHOLD:
        reasons["nodata"] = f"{nodata_ratio:.0%} of pixels are nodata"
    if cloud_coverage > CLOUD_DEGRADE_THRESHOLD:
        reasons["cloud"] = f"{cloud_coverage:.0%} cloud cover"
    if valid_pixel_ratio < MIN_VALID_PIXEL_RATIO:
        reasons["valid_pixels"] = f"only {valid_pixel_ratio:.0%} valid pixels"

    # Weighted score: heavier penalty for nodata and cloud, lighter for geometry issues
    score = 1.0
    score -= min(nodata_ratio, 1.0) * 0.4
    score -= min(cloud_coverage, 1.0) * 0.4
    score -= 0.0 if resolution_ok else 0.1
    score -= 0.0 if geospatial_valid else 0.3
    score = max(0.0, min(1.0, score))

    if not geospatial_valid or nodata_ratio > NODATA_REJECT_THRESHOLD or cloud_coverage > CLOUD_REJECT_THRESHOLD:
        status = "UNUSABLE"
    elif cloud_coverage > CLOUD_DEGRADE_THRESHOLD or valid_pixel_ratio < MIN_VALID_PIXEL_RATIO or not resolution_ok:
        status = "DEGRADED"
    else:
        status = "GOOD"

    return QualityResult(
        cloud_coverage=cloud_coverage,
        valid_pixel_ratio=valid_pixel_ratio,
        nodata_ratio=nodata_ratio,
        resolution_ok=resolution_ok,
        geospatial_valid=geospatial_valid,
        quality_score=round(score, 3),
        status=status,
        reasons=reasons,
    )
