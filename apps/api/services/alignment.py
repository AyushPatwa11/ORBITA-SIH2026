"""
Temporal alignment pipeline (§7 of the spec). Two raw rasters from
different acquisitions are never subtracted directly — they go through:

  reprojection/CRS normalization -> resolution harmonization ->
  co-registration (sub-pixel shift estimate) -> common analysis grid ->
  valid-pixel mask -> alignment_quality metric

If alignment_quality is below threshold the pair is flagged and the
caller should lower confidence or reject the comparison rather than
silently feeding misaligned pixels to change detection.
"""

import os
from dataclasses import dataclass

os.environ.setdefault("GDAL_MEM_ENABLE_OPEN", "YES")

import numpy as np
import rasterio
from rasterio.env import Env
from rasterio.warp import Resampling, calculate_default_transform, reproject
from skimage.registration import phase_cross_correlation
from scipy.ndimage import shift as nd_shift

ALIGNMENT_QUALITY_REJECT_THRESHOLD = 0.4


@dataclass
class AlignedPair:
    before: np.ndarray          # (bands, H, W) float32, harmonized grid
    after: np.ndarray
    valid_mask: np.ndarray       # (H, W) bool — True where both are valid
    shift_yx: tuple[float, float]
    alignment_quality: float     # 0..1, derived from correlation confidence
    accepted: bool
    transform: rasterio.Affine
    crs: str


def _reproject_to_grid(path: str, dst_crs: str, dst_transform, width: int, height: int) -> np.ndarray:
    with Env(GDAL_MEM_ENABLE_OPEN="YES"):
        with rasterio.open(path) as src:
            n_bands = src.count
            dst = np.zeros((n_bands, height, width), dtype=np.float32)
            for b in range(1, n_bands + 1):
                reproject(
                    source=rasterio.band(src, b),
                    destination=dst[b - 1],
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=dst_transform,
                    dst_crs=dst_crs,
                    resampling=Resampling.bilinear,
                )
    return dst


def align_pair(before_path: str, after_path: str, target_gsd: float = 10.0) -> AlignedPair:
    with Env(GDAL_MEM_ENABLE_OPEN="YES"):
        with rasterio.open(before_path) as ref:
            dst_crs = ref.crs
            dst_transform, width, height = calculate_default_transform(
                ref.crs, dst_crs, ref.width, ref.height, *ref.bounds, resolution=target_gsd
            )

        before = _reproject_to_grid(before_path, dst_crs, dst_transform, width, height)
        after = _reproject_to_grid(after_path, dst_crs, dst_transform, width, height)

    # Co-registration: estimate residual shift on band 1 via phase correlation.
    # Note: skimage's own "error" output is not used for confidence — with a
    # large DC offset (typical reflectance values, not zero-mean) it saturates
    # near 1.0 regardless of actual match quality. Confidence is instead the
    # real post-registration Pearson correlation between the two bands.
    ref_band = np.nan_to_num(before[0])
    mov_band = np.nan_to_num(after[0])
    shift_yx, _, _ = phase_cross_correlation(ref_band, mov_band, upsample_factor=10)

    for b in range(after.shape[0]):
        after[b] = nd_shift(after[b], shift=shift_yx, mode="constant", cval=0.0)

    valid_mask = (before[0] != 0) & (after[0] != 0)
    alignment_quality = _post_registration_confidence(before[0], after[0], valid_mask)

    accepted = alignment_quality >= ALIGNMENT_QUALITY_REJECT_THRESHOLD

    return AlignedPair(
        before=before,
        after=after,
        valid_mask=valid_mask,
        shift_yx=tuple(shift_yx),
        alignment_quality=round(alignment_quality, 3),
        accepted=accepted,
        transform=dst_transform,
        crs=str(dst_crs),
    )


def _post_registration_confidence(before_band: np.ndarray, after_band: np.ndarray, valid_mask: np.ndarray) -> float:
    if valid_mask.sum() < 100:
        return 0.0
    a = before_band[valid_mask].astype(np.float64)
    b = after_band[valid_mask].astype(np.float64)
    if a.std() < 1e-6 or b.std() < 1e-6:
        return 0.0
    corr = np.corrcoef(a, b)[0, 1]
    if np.isnan(corr):
        return 0.0
    return float(max(0.0, min(1.0, corr)))
