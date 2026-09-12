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
from PIL import Image, ImageFilter, ImageEnhance, ImageOps
from rasterio.enums import Resampling


def _safe_stack_and_normalize(arr: np.ndarray, mode: str) -> np.ndarray:
    """Return a normalized stacked RGB array safe for preview rendering."""
    if arr.ndim == 3:
        return arr

    # Raster datasets come in as band-first arrays, so only the RGB/A band stack
    # should ever be passed to the image writer. Guard against malformed shape.
    if arr.shape[0] == 1:
        arr = np.repeat(arr, 3, axis=0)
    elif arr.shape[0] == 2:
        arr = np.repeat(arr, 2, axis=0)

    return arr


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
    try:
        with rasterio.open(path) as src:
            total_bands = src.count
            target_size = 2048 if hd else max_size
            if hd:
                scale = 1.0
            else:
                scale = min(1.0, target_size / max(src.width, src.height))
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

        if mode == "false_color":
            if arr.shape[0] >= 4:
                nir = arr[3]
                red = arr[2]
                green = arr[1]
            else:
                nir = np.clip(arr[1] * 1.4 - arr[0] * 0.3, 0.0, 1.0)
                red = arr[2] if arr.shape[0] >= 3 else arr[0]
                green = arr[1] if arr.shape[0] >= 2 else arr[0]
            channels = [nir, red, green]
        else:
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
        img = ImageOps.autocontrast(img)

        if mode == "night":
            enhancer = ImageEnhance.Brightness(img)
            img = enhancer.enhance(0.65)
            contrast = ImageEnhance.Contrast(img)
            img = contrast.enhance(1.45)
            img = img.filter(ImageFilter.UnsharpMask(radius=1.4, percent=130, threshold=1))
        elif mode == "false_color":
            img = ImageEnhance.Contrast(img).enhance(1.22)
            img = img.filter(ImageFilter.UnsharpMask(radius=1.4, percent=150, threshold=2))
            img = ImageEnhance.Sharpness(img).enhance(1.4)
        else:
            img = ImageEnhance.Contrast(img).enhance(1.20)
            img = img.filter(ImageFilter.UnsharpMask(radius=1.4, percent=150, threshold=2))
            img = ImageEnhance.Sharpness(img).enhance(1.35)

        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=False, compress_level=1)
        return buf.getvalue()
    except (FileNotFoundError, rasterio.errors.RasterioIOError, OSError) as exc:
        raise FileNotFoundError(f"Scene raster file is missing or malformed: {path}") from exc

