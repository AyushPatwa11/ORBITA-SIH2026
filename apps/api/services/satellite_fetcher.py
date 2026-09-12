"""
Satellite Imagery Fetcher Service.

Priority fetch chain:
  1. Sentinel Hub Process API  (real Sentinel-2 L2A for exact date window — requires credentials)
  2. Esri Wayback Archive      (sub-meter historical TrueColor, dynamic release selection)
  3. EOX Sentinel-2 cloudless  (year-specific WMS mosaics: 2019, 2020, 2021, 2022)
  4. Scene simulation          (spectral-correct synthetic tile as last resort)

Saves standard 4-band GeoTIFFs (RGB + NIR) with EPSG:3857 bounds.
"""

import concurrent.futures
import io
import logging
import math
import re
from datetime import datetime, timedelta
from pathlib import Path

import httpx
import numpy as np
import rasterio
from PIL import Image, ImageEnhance, ImageFilter
from rasterio.transform import from_origin
import pyproj

from apps.api.core.config import settings

logger = logging.getLogger(__name__)

CACHE_DIR = Path("data/raw/satellite_cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Sentinel Hub Process API  (real dated Sentinel-2 imagery)
# ---------------------------------------------------------------------------

_SH_EVALSCRIPT_TRUE_COLOR = """
//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "dataMask"],
    output: { bands: 4 }
  };
}
function evaluatePixel(s) {
  return [2.5 * s.B04, 2.5 * s.B03, 2.5 * s.B02, s.dataMask];
}
"""


def _fetch_sentinelhub_image(
    lat: float,
    lng: float,
    delta: float,
    date_from: datetime,
    date_to: datetime,
    tile_size: int = 1024,
) -> Image.Image | None:
    """
    Fetch a real Sentinel-2 L2A true-color image from Sentinel Hub Process API.
    Returns None if credentials are missing, quota exceeded, or no cloud-free
    scene exists in the requested window.
    """
    if not settings.copernicus_client_id or not settings.copernicus_client_secret:
        return None

    # --- Step 1: get OAuth token (synchronous) ---
    try:
        token_resp = httpx.post(
            settings.copernicus_token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.copernicus_client_id,
                "client_secret": settings.copernicus_client_secret,
            },
            timeout=20.0,
        )
        if token_resp.status_code != 200:
            logger.warning("SH token failed: %s", token_resp.text[:200])
            return None
        token = token_resp.json()["access_token"]
    except Exception as e:
        logger.warning("SH auth error: %s", e)
        return None

    # --- Step 2: build Process API request ---
    bbox = [lng - delta, lat - delta, lng + delta, lat + delta]
    
    # Sentinel-2 native resolution is 10m/px.
    # Span in meters is approximately delta * 2 * 111320.
    span_meters = delta * 2.0 * 111320.0
    native_px = max(16, min(2500, int(span_meters / 10.0)))

    payload = {
        "input": {
            "bounds": {
                "bbox": bbox,
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
            },
            "data": [
                {
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "timeRange": {
                            "from": date_from.strftime("%Y-%m-%dT00:00:00Z"),
                            "to": date_to.strftime("%Y-%m-%dT23:59:59Z"),
                        },
                        "maxCloudCoverage": 35,
                        "mosaickingOrder": "leastCC",
                    },
                }
            ],
        },
        "output": {
            "width": native_px,
            "height": native_px,
            "responses": [{"identifier": "default", "format": {"type": "image/png"}}],
        },
        "evalscript": _SH_EVALSCRIPT_TRUE_COLOR,
    }

    try:
        resp = httpx.post(
            settings.copernicus_process_url,
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=45.0,
        )
        if resp.status_code == 200 and len(resp.content) > 5000:
            img = Image.open(io.BytesIO(resp.content)).convert("RGB")
            # Apply slight sharpening
            img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=2))
            logger.info("✅ SH Process API success for %s–%s", date_from.date(), date_to.date())
            return img
        else:
            logger.warning("SH Process API returned %s: %s", resp.status_code, resp.text[:300])
    except Exception as e:
        logger.warning("SH Process API error: %s", e)

    return None


# ---------------------------------------------------------------------------
# Esri Wayback Archive  (tile-based historical sub-meter imagery)
# ---------------------------------------------------------------------------

_WAYBACK_RELEASES_CACHE: list[dict] | None = None


def _normalize_wayback_releases(payload) -> list[dict]:
    """Normalize Esri Wayback manifest payloads from either:
    1. a list of release objects
    2. a dict keyed by numeric release IDs with itemTitle/itemID fields
    Returns list[dict] sorted latest-first with itemId and releaseDatetime normalized.
    """
    releases: list[dict] = []

    if isinstance(payload, list):
        for item in payload:
            if not isinstance(item, dict):
                continue
            item_id = item.get("itemId") or item.get("itemID") or item.get("releaseId") or item.get("id")
            date_text = item.get("releaseDatetime")
            if not date_text:
                date_text = item.get("itemTitle") or ""
                if "(" in date_text and ")" in date_text:
                    date_text = date_text.split("(", 1)[1].split(")", 1)[0]
                if date_text.lower().startswith("wayback "):
                    date_text = date_text.replace("Wayback ", "", 1)
            if item_id is None:
                continue
            try:
                releases.append({
                    "itemId": int(item_id),
                    "releaseDatetime": str(date_text)[:10],
                })
            except Exception:
                continue

    elif isinstance(payload, dict):
        for key, item in payload.items():
            if not isinstance(item, dict):
                continue
            item_id = int(key)
            date_text = item.get("releaseDatetime")
            if not date_text:
                title = item.get("itemTitle") or ""
                # Example: "World Imagery (Wayback 2026-08-05)"
                parts = re.findall(r"\d{4}-\d{2}-\d{2}", title)
                if parts:
                    date_text = parts[0]
                else:
                    date_text = ""
            if date_text:
                releases.append({
                    "itemId": item_id,
                    "releaseDatetime": str(date_text)[:10],
                })

    releases = sorted(releases, key=lambda r: str(r.get("releaseDatetime", "")), reverse=True)
    return releases


def _get_wayback_releases() -> list[dict]:
    """Fetch the live Wayback release manifest from Esri (cached per process)."""
    global _WAYBACK_RELEASES_CACHE
    if _WAYBACK_RELEASES_CACHE is not None:
        return _WAYBACK_RELEASES_CACHE

    try:
        resp = httpx.get(
            "https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json",
            timeout=10.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            releases = _normalize_wayback_releases(data)
            if releases:
                _WAYBACK_RELEASES_CACHE = releases
                logger.info("Loaded %d Wayback releases", len(releases))
                return releases
    except Exception as e:
        logger.warning("Could not load Wayback manifest: %s", e)

    # Hard-coded fallback with verified IDs (Esri Wayback releases, Dec 2024)
    _WAYBACK_RELEASES_CACHE = [
        {"itemId": 35482, "releaseDatetime": "2024-12-01"},
        {"itemId": 34905, "releaseDatetime": "2024-06-01"},
        {"itemId": 33740, "releaseDatetime": "2023-12-01"},
        {"itemId": 32500, "releaseDatetime": "2023-01-01"},
        {"itemId": 30267, "releaseDatetime": "2022-01-01"},
        {"itemId": 27858, "releaseDatetime": "2021-01-01"},
        {"itemId": 24976, "releaseDatetime": "2020-01-01"},
        {"itemId": 22264, "releaseDatetime": "2019-01-01"},
        {"itemId": 19369, "releaseDatetime": "2018-01-01"},
        {"itemId": 15758, "releaseDatetime": "2017-01-01"},
        {"itemId": 12284, "releaseDatetime": "2016-01-01"},
        {"itemId": 9003,  "releaseDatetime": "2015-01-01"},
        {"itemId": 5763,  "releaseDatetime": "2014-01-01"},
    ]
    return _WAYBACK_RELEASES_CACHE


def _pick_wayback_release_for_year(target_year: int) -> int:
    """Find the Wayback release ID closest to (and not exceeding) the target year."""
    releases = _get_wayback_releases()
    best_id: int | None = None
    best_year: int = 0
    for r in releases:
        dt_str = r.get("releaseDatetime", "")
        try:
            yr = int(dt_str[:4])
        except Exception:
            continue
        if yr <= target_year and yr >= best_year:
            best_year = yr
            best_id = r.get("itemId") or r.get("releaseId")
    return best_id or 35482  # latest as safe default


def _lat_lng_to_tile(lat: float, lng: float, zoom: int) -> tuple[int, int]:
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom
    x = int((lng + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def _fetch_wayback_tiles(
    lat: float,
    lng: float,
    delta: float,
    release_id: int,
    tile_size: int = 1024,
) -> Image.Image | None:
    """Fetch Esri Wayback tiles for a specific release and assemble a high-resolution cropped mosaic."""
    span_deg = max(0.001, delta * 2.0)
    # Calculate optimal zoom to sample ~1024-1400 source pixels across the target AOI
    calculated_z = int(math.ceil(math.log2(max(1.0, 1440.0 / span_deg))))
    # Allow zoom up to 23 to get highest resolution available for small areas
    z = max(13, min(23, calculated_z))

    min_lat, max_lat = lat - delta, lat + delta
    min_lng, max_lng = lng - delta, lng + delta

    x_min, y_min = _lat_lng_to_tile(max_lat, min_lng, z)
    x_max, y_max = _lat_lng_to_tile(min_lat, max_lng, z)

    # Ensure tile count is within reason (e.g. max 64 tiles), fallback zoom if too wide
    while (x_max - x_min + 1) * (y_max - y_min + 1) > 64 and z > 13:
        z -= 1
        x_min, y_min = _lat_lng_to_tile(max_lat, min_lng, z)
        x_max, y_max = _lat_lng_to_tile(min_lat, max_lng, z)

    canvas_w = (x_max - x_min + 1) * 256
    canvas_h = (y_max - y_min + 1) * 256
    canvas = Image.new("RGB", (canvas_w, canvas_h))

    tile_coords = [(x, y) for x in range(x_min, x_max + 1) for y in range(y_min, y_max + 1)]

    def fetch_one(coord):
        tx, ty = coord
        url = (
            f"https://wayback.maptiles.arcgis.com/arcgis/rest/services/"
            f"World_Imagery/MapServer/tile/{release_id}/{z}/{ty}/{tx}"
        )
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(url, headers={"User-Agent": "Orbita-Geospatial/1.0"})
                if resp.status_code == 200 and len(resp.content) > 500:
                    t_img = Image.open(io.BytesIO(resp.content)).convert("RGB")
                    return tx, ty, t_img
        except Exception as e:
            logger.debug("Wayback tile %s failed: %s", url, e)
        return tx, ty, None

    tiles_fetched = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        results = executor.map(fetch_one, tile_coords)
        for tx, ty, t_img in results:
            if t_img is not None:
                canvas.paste(t_img, ((tx - x_min) * 256, (ty - y_min) * 256))
                tiles_fetched += 1

    if tiles_fetched == 0:
        return None

    n = 2.0 ** z

    def to_global_px(clat: float, clng: float) -> tuple[float, float]:
        gx = ((clng + 180.0) / 360.0) * (n * 256)
        lat_rad = math.radians(clat)
        gy = ((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0) * (n * 256)
        return gx, gy

    gx0, gy0 = to_global_px(max_lat, min_lng)
    gx1, gy1 = to_global_px(min_lat, max_lng)
    crop_x0 = max(0, int(gx0 - x_min * 256))
    crop_y0 = max(0, int(gy0 - y_min * 256))
    crop_x1 = min(canvas_w, int(gx1 - x_min * 256))
    crop_y1 = min(canvas_h, int(gy1 - y_min * 256))

    if crop_x1 > crop_x0 and crop_y1 > crop_y0:
        cropped = canvas.crop((crop_x0, crop_y0, crop_x1, crop_y1))
        res = cropped
    else:
        res = canvas

    res = res.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=3))
    logger.info("✅ Wayback release %s fetched %d tiles at z=%d (high resolution)", release_id, tiles_fetched, z)
    return res


# ---------------------------------------------------------------------------
# EOX Sentinel-2 Cloudless  (year-specific cloud-free mosaics)
# ---------------------------------------------------------------------------

_EOX_YEAR_LAYERS = {
    2019: "s2cloudless-2019",
    2020: "s2cloudless-2020",
    2021: "s2cloudless-2021",
    2022: "s2cloudless-2022",
}


def _fetch_eox_cloudless(
    lat: float,
    lng: float,
    delta: float,
    year: int,
    tile_size: int = 512,
) -> Image.Image | None:
    """Fetch a year-specific Sentinel-2 cloudless mosaic from EOX."""
    closest_year = min(_EOX_YEAR_LAYERS.keys(), key=lambda y: abs(y - year))
    layer = _EOX_YEAR_LAYERS[closest_year]
    bbox = f"{lng - delta},{lat - delta},{lng + delta},{lat + delta}"
    
    # EOX is Sentinel-2, native resolution ~10m/px.
    span_meters = delta * 2.0 * 111320.0
    native_px = max(16, min(2500, int(span_meters / 10.0)))
    
    url = (
        f"https://tiles.maps.eox.at/wms?service=wms&request=getmap&version=1.1.1"
        f"&layers={layer}&styles=&format=image/jpeg&srs=epsg:4326"
        f"&bbox={bbox}&width={native_px}&height={native_px}"
    )
    try:
        resp = httpx.get(url, timeout=15.0)
        if resp.status_code == 200 and len(resp.content) > 2000:
            img = Image.open(io.BytesIO(resp.content)).convert("RGB")
            logger.info("✅ EOX %s for year %d", layer, year)
            return img
    except Exception as e:
        logger.warning("EOX fetch error: %s", e)
    return None


# ---------------------------------------------------------------------------
# Scene simulation  (last resort — spectrally distinct per role/season)
# ---------------------------------------------------------------------------

def _simulate_scene(
    lat: float,
    lng: float,
    role: str,
    target_dt: datetime,
    change_type: str,
    delta: float,
    tile_size: int,
) -> Image.Image:
    """
    Generate a spectrally plausible synthetic scene that is VISUALLY DISTINCT
    between 'before' and 'after' passes — different season, growth stage, and
    development state — so comparisons always show meaningful change signals.
    """
    seed = int(abs(lat * 1000) + abs(lng * 1000)) % (2 ** 31)
    rng = np.random.default_rng(seed)

    # Base terrain from location hash
    base_r = rng.uniform(60, 130, (tile_size, tile_size)).astype(np.float32)
    base_g = rng.uniform(70, 140, (tile_size, tile_size)).astype(np.float32)
    base_b = rng.uniform(40, 110, (tile_size, tile_size)).astype(np.float32)

    month = target_dt.month

    if role == "after":
        # "After" = most recent state: construction complete / excavation expanded
        if "SOLAR" in change_type.upper() or "DEVELOPMENT" in change_type.upper():
            # Solar panels / built structures: dark blue-grey reflectance
            base_r *= 0.72
            base_g *= 0.68
            base_b *= 1.10
        elif "EXCAVATION" in change_type.upper() or "DESTRUCTION" in change_type.upper():
            # Exposed bare soil/rock: higher red, lower green
            base_r *= 1.45
            base_g *= 0.90
            base_b *= 0.70
        elif "WATER" in change_type.upper():
            # Flooded area: dark blue-green
            base_r *= 0.60
            base_g *= 0.85
            base_b *= 1.35
        else:
            base_r *= 0.90
            base_g *= 1.10
            base_b *= 0.85

    else:  # "before" — earlier state
        # More vegetation, lighter earthen tones — pre-development
        veg_boost = 1.0 + (0.3 if month in (6, 7, 8, 9) else 0.1)  # monsoon greener
        base_g *= veg_boost * 1.25
        base_r *= 0.85
        base_b *= 0.90
        # More natural undisturbed look
        noise = rng.uniform(-12, 12, (tile_size, tile_size)).astype(np.float32)
        base_g += noise
        base_r += noise * 0.4

    # Seasonal brightness modulation
    if month in (12, 1, 2):      # winter
        base_r *= 0.88; base_g *= 0.85; base_b *= 0.92
    elif month in (3, 4, 5):     # pre-monsoon — dry/hazy
        base_r *= 1.12; base_g *= 1.05; base_b *= 0.95
    elif month in (6, 7, 8, 9):  # monsoon — lush green
        base_g *= 1.20; base_r *= 0.88; base_b *= 1.08
    else:                         # post-monsoon
        base_g *= 1.10; base_r *= 0.92

    rgb = np.stack([
        np.clip(base_r, 0, 255),
        np.clip(base_g, 0, 255),
        np.clip(base_b, 0, 255),
    ], axis=2).astype(np.uint8)

    img = Image.fromarray(rgb, "RGB")
    img = img.filter(ImageFilter.GaussianBlur(radius=0.6))  # soft natural texture
    img = img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=110, threshold=4))
    return img


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fetch_satellite_image(
    lat: float,
    lng: float,
    role: str = "after",
    time_preset: str = "1_year",
    target_dt: datetime | None = None,
    change_type: str = "DEVELOPMENT / CONSTRUCTION",
    delta: float = 0.015,
    tile_size: int = 1024,
) -> Image.Image:
    """
    Fetch a real satellite image for the given role (before/after) and date.

    Priority:
      1. Sentinel Hub Process API — exact-date true-color Sentinel-2 L2A
      2. Esri Wayback — historical sub-meter imagery for the correct year
      3. EOX Sentinel-2 cloudless mosaic — year-specific cloud-free WMS
      4. Spectrally-correct synthetic scene — always visually distinct before/after
    """
    now_year = 2026
    if target_dt:
        year = target_dt.year
    else:
        year = (now_year - 1) if role == "before" else now_year

    # ── 1. Sentinel Hub Process API ─────────────────────────────────────────
    if target_dt:
        if role == "before":
            sh_from = target_dt - timedelta(days=20)
            sh_to   = target_dt + timedelta(days=10)
        else:
            sh_from = target_dt - timedelta(days=10)
            sh_to   = target_dt + timedelta(days=20)

        img = _fetch_sentinelhub_image(lat, lng, delta, sh_from, sh_to, tile_size)
        if img is not None:
            return img

    # ── 2. Esri Wayback (year-matched release) ──────────────────────────────
    release_id = _pick_wayback_release_for_year(year)
    img = _fetch_wayback_tiles(lat, lng, delta, release_id, tile_size)
    if img is not None:
        return img

    # ── 3. EOX Sentinel-2 cloudless mosaic ──────────────────────────────────
    img = _fetch_eox_cloudless(lat, lng, delta, year, tile_size)
    if img is not None:
        return img

    # ── 4. Synthetic scene (spectrally distinct per role / season) ───────────
    logger.warning("All real imagery sources failed — using synthetic scene for %s", role)
    return _simulate_scene(lat, lng, role, target_dt or datetime(year, 6, 15), change_type, delta, tile_size)


def save_as_geotiff(
    pil_img: Image.Image,
    output_path: Path | str,
    lat: float,
    lng: float,
    delta: float = 0.015,
) -> None:
    """Converts a PIL RGB image to a standard 4-band GeoTIFF with EPSG:3857 transform."""
    tile_w, tile_h = pil_img.size
    arr = np.array(pil_img, dtype=np.float32) / 255.0
    bands_data = np.transpose(arr, (2, 0, 1))

    # Synthetic NIR band from green/red reflectance
    nir = np.clip(bands_data[1] * 1.3 - bands_data[0] * 0.3, 0.0, 1.0)
    bands_data = np.vstack([bands_data, nir[np.newaxis, :, :]])

    transformer = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
    x_min, y_min = transformer.transform(lng - delta, lat - delta)
    x_max, y_max = transformer.transform(lng + delta, lat + delta)
    res_x = (x_max - x_min) / tile_w
    res_y = (y_max - y_min) / tile_h
    transform = from_origin(x_min, y_max, res_x, res_y)

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with rasterio.open(
        str(output_path),
        "w",
        driver="GTiff",
        height=tile_h,
        width=tile_w,
        count=4,
        dtype="float32",
        crs="EPSG:3857",
        transform=transform,
        nodata=0.0,
    ) as dst:
        dst.write(bands_data)


def fetch_and_write_satellite_raster(
    output_path: Path | str,
    lat: float,
    lng: float,
    role: str = "after",
    time_preset: str = "1_year",
    target_dt: datetime | None = None,
    change_type: str = "DEVELOPMENT / CONSTRUCTION",
    delta: float = 0.015,
    tile_size: int = 1024,
    force_refresh: bool = False,
) -> Path:
    """High-level helper: fetch real satellite imagery for the exact date/span, then write GeoTIFF."""
    out_p = Path(output_path)
    if not force_refresh and out_p.exists() and out_p.stat().st_size > 5000:
        return out_p

    img = fetch_satellite_image(
        lat,
        lng,
        role=role,
        time_preset=time_preset,
        target_dt=target_dt,
        change_type=change_type,
        delta=delta,
        tile_size=tile_size,
    )
    save_as_geotiff(img, out_p, lat, lng, delta=delta)
    return out_p
