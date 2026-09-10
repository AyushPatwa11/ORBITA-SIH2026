"""
Serves an actual rendered preview image from a scene's local raster.
This is real image processing over whatever file sits at Scene.local_path
(a real Sentinel-2 download when configured with live credentials, or a
synthetic demo raster when seeded via /demo/seed) — never a placeholder
or stock image.
"""

import io

import numpy as np
import rasterio
from PIL import Image, ImageFilter, ImageEnhance
from rasterio.enums import Resampling


def render_rgb_preview(path: str, max_size: int = 768) -> bytes:
    """Render a crisp RGB preview PNG from a local GeoTIFF raster.

    Uses Lanczos resampling for sub-pixel-accurate downscaling and
    an unsharp mask pass to preserve micro-feature sharpness at all
    detection radii.
    """
    with rasterio.open(path) as src:
        band_count = min(3, src.count)
        scale = min(1.0, max_size / max(src.width, src.height))
        out_w = max(1, int(src.width * scale))
        out_h = max(1, int(src.height * scale))

        arr = src.read(
            indexes=list(range(1, band_count + 1)),
            out_shape=(band_count, out_h, out_w),
            resampling=Resampling.lanczos,  # sharper than bilinear
        ).astype(np.float32)

    if band_count == 1:
        arr = np.repeat(arr, 3, axis=0)

    rgb = np.zeros((arr.shape[1], arr.shape[2], 3), dtype=np.uint8)
    for b in range(3):
        band = arr[b]
        # 2-98 percentile stretch to preserve true-color contrast
        lo, hi = np.percentile(band, [2, 98])
        if hi <= lo:
            hi = lo + 1.0
        stretched = np.clip((band - lo) / (hi - lo), 0, 1) * 255
        rgb[:, :, b] = stretched.astype(np.uint8)

    img = Image.fromarray(rgb, mode="RGB")

    # Slight unsharp mask to recover crispness after resampling
    img = img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=130, threshold=3))

    # Subtle contrast boost for outdoor satellite imagery
    img = ImageEnhance.Contrast(img).enhance(1.08)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=False, compress_level=1)
    return buf.getvalue()

