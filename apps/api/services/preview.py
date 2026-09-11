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


def render_rgb_preview(
    path: str,
    max_size: int = 1536,
    hd: bool = False,
    mode: str = "rgb",
) -> bytes:
    """Render a crisp, high-resolution preview PNG from a local GeoTIFF raster.

    Supports:
      - Standard True-Color RGB
      - False Color (NIR / Vegetation & Urban Infrared)
      - Night / Dark Earth Mode
      - HD / Full-Resolution Rendering (no downscaling when hd=True)
    """
    with rasterio.open(path) as src:
        total_bands = src.count
        target_size = 2048 if hd else max_size
        scale = 1.0 if hd else min(1.0, target_size / max(src.width, src.height))
        out_w = max(1, int(src.width * scale))
        out_h = max(1, int(src.height * scale))

        read_count = min(4, total_bands)
        arr = src.read(
            indexes=list(range(1, read_count + 1)),
            out_shape=(read_count, out_h, out_w),
            resampling=Resampling.lanczos,
        ).astype(np.float32)

    if read_count == 1:
        arr = np.repeat(arr, 3, axis=0)

    # Visualization modes mapping
    if mode == "false_color":
        # Standard False Color Infrared: Red=NIR, Green=Red, Blue=Green
        if arr.shape[0] >= 4:
            nir = arr[3]
            red = arr[2]
            green = arr[1]
        else:
            # Synthetic NIR approximation
            nir = np.clip(arr[1] * 1.4 - arr[0] * 0.3, 0.0, 1.0)
            red = arr[2] if arr.shape[0] >= 3 else arr[0]
            green = arr[1] if arr.shape[0] >= 2 else arr[0]
        channels = [nir, red, green]
    else:
        # Standard RGB (bands 1=B, 2=G, 3=R or 1=R, 2=G, 3=B)
        # In our GeoTIFFs, band 0=B, 1=G, 2=R
        r = arr[2] if arr.shape[0] >= 3 else arr[0]
        g = arr[1] if arr.shape[0] >= 2 else arr[0]
        b = arr[0]
        channels = [r, g, b]

    rgb = np.zeros((arr.shape[1], arr.shape[2], 3), dtype=np.uint8)
    for i, ch in enumerate(channels):
        lo, hi = np.percentile(ch, [1.5, 98.5])
        if hi <= lo:
            hi = lo + 1.0
        stretched = np.clip((ch - lo) / (hi - lo), 0, 1) * 255.0
        rgb[:, :, i] = stretched.astype(np.uint8)

    img = Image.fromarray(rgb, mode="RGB")

    if mode == "night":
        # Dark Earth night mode: deep dark tones with bright luminous hotspots
        enhancer = ImageEnhance.Brightness(img)
        img = enhancer.enhance(0.65)
        contrast = ImageEnhance.Contrast(img)
        img = contrast.enhance(1.4)
    else:
        # Crisp contrast boost and unsharp mask for pristine edge clarity
        img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=125, threshold=2))
        img = ImageEnhance.Contrast(img).enhance(1.08)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=False, compress_level=1)
    return buf.getvalue()

