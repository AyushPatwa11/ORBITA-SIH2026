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
import json
import logging
import math
import re
import time
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

# Sentinel-2 L2A native GSD for RGB/NIR is 10 m. Requesting more output
# pixels than span_meters/10 only upsamples 10 m data and looks like HD.
_S2_GSD_M = 10.0
_EARTH_CIRCUM_M = 40075016.686
_TARGET_PREVIEW_PX = 1536
_MAX_OUTPUT_PX = 2500
_MAX_TILES = 81
_SH_TOKEN: tuple[str, float] | None = None


def span_meters(delta_deg: float) -> float:
    return max(1.0, float(delta_deg) * 2.0 * 111320.0)


def sentinel2_native_px(delta_deg: float) -> int:
    return max(1, int(span_meters(delta_deg) / _S2_GSD_M))


def sentinel2_needs_upsample(delta_deg: float, target_px: int) -> bool:
    """True when 10 m Sentinel-2 cannot fill the viewer without upsampling."""
    return sentinel2_native_px(delta_deg) < int(target_px * 0.9)


def zoom_for_span(lat: float, span_m: float, target_px: int, max_z: int = 19) -> int:
    """Web-Mercator zoom whose native tile GSD yields ~target_px across the AOI."""
    lat_cos = max(0.15, abs(math.cos(math.radians(lat))))
    ratio = _EARTH_CIRCUM_M * lat_cos * max(1, target_px) / (256.0 * max(span_m, 1.0))
    z = math.ceil(math.log2(max(1.0, ratio)))
    return int(max(12, min(max_z, z)))


def meters_per_pixel(lat: float, zoom: int) -> float:
    lat_cos = max(0.15, abs(math.cos(math.radians(lat))))
    return _EARTH_CIRCUM_M * lat_cos / (256.0 * (2.0 ** zoom))


def _annotate(img: Image.Image, **meta) -> Image.Image:
    img.info["orbita_meta"] = json.dumps(meta)
    return img


def read_image_meta(img: Image.Image) -> dict:
    raw = img.info.get("orbita_meta")
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}


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


def _sentinelhub_token() -> str | None:
    global _SH_TOKEN
    now = time.time()
    if _SH_TOKEN and _SH_TOKEN[1] > now + 30:
        return _SH_TOKEN[0]
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
        body = token_resp.json()
        token = body["access_token"]
        _SH_TOKEN = (token, now + float(body.get("expires_in", 600)))
        return token
    except Exception as e:
        logger.warning("SH auth error: %s", e)
        return None


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

    # Skip Sentinel-2 when the AOI is smaller than native 10 m coverage of
    # the requested canvas — that path is the source of school-scale blur.
    native_px = sentinel2_native_px(delta)
    if native_px < int(tile_size * 0.9):
        logger.info(
            "Skipping Sentinel Hub for small AOI (native 10m would be %d px, need %d)",
            native_px,
            tile_size,
        )
        return None

    token = _sentinelhub_token()
    if not token:
        return None

    # --- Step 2: build Process API request ---
    bbox = [lng - delta, lat - delta, lng + delta, lat + delta]
    # Request native 10 m pixels only — never upsample S2 into fake HD.
    out_px = max(64, min(_MAX_OUTPUT_PX, native_px))

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
            "width": out_px,
            "height": out_px,
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
            logger.info("✅ SH Process API success for %s–%s (%dx%d native 10 m)", date_from.date(), date_to.date(), img.size[0], img.size[1])
            return _annotate(img, source="sentinel-2-l2a", gsd_m=_S2_GSD_M, pixels=list(img.size))
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


def _pick_wayback_release_for_date(
    target_dt: datetime,
    exclude_ids: set[int] | None = None,
) -> tuple[int, str]:
    """Latest Wayback release on or before target_dt, skipping exclude_ids."""
    releases = _get_wayback_releases()
    exclude_ids = exclude_ids or set()
    target = target_dt.strftime("%Y-%m-%d")
    eligible = [r for r in releases if int(r["itemId"]) not in exclude_ids]
    if not eligible:
        eligible = list(releases)
    on_or_before = [r for r in eligible if str(r.get("releaseDatetime", ""))[:10] <= target]
    chosen = on_or_before[0] if on_or_before else eligible[-1]
    return int(chosen["itemId"]), str(chosen.get("releaseDatetime", ""))[:10]


def _pick_wayback_release_for_year(target_year: int) -> int:
    """Find the Wayback release ID closest to (and not exceeding) the target year."""
    item_id, _ = _pick_wayback_release_for_date(datetime(target_year, 12, 31))
    return item_id


def _lat_lng_to_tile(lat: float, lng: float, zoom: int) -> tuple[int, int]:
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom
    x = int((lng + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def _assemble_mercator_mosaic(
    lat: float,
    lng: float,
    delta: float,
    z: int,
    x_min: int,
    y_min: int,
    x_max: int,
    y_max: int,
    url_fn,
) -> Image.Image | None:
    canvas_w = (x_max - x_min + 1) * 256
    canvas_h = (y_max - y_min + 1) * 256
    canvas = Image.new("RGB", (canvas_w, canvas_h))
    tile_coords = [(x, y) for x in range(x_min, x_max + 1) for y in range(y_min, y_max + 1)]

    def fetch_one(coord):
        tx, ty = coord
        url = url_fn(tx, ty, z)
        try:
            resp = httpx.get(url, headers={"User-Agent": "ORBITA-SIH2026/1.0"}, timeout=12.0)
            if resp.status_code == 200 and len(resp.content) > 500:
                return tx, ty, Image.open(io.BytesIO(resp.content)).convert("RGB")
        except Exception as e:
            logger.debug("Tile failed %s: %s", url, e)
        return tx, ty, None

    tiles_fetched = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        for tx, ty, t_img in executor.map(fetch_one, tile_coords):
            if t_img is not None:
                canvas.paste(t_img, ((tx - x_min) * 256, (ty - y_min) * 256))
                tiles_fetched += 1

    if tiles_fetched == 0:
        return None

    n = 2.0 ** z
    min_lat, max_lat = lat - delta, lat + delta
    min_lng, max_lng = lng - delta, lng + delta

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
    if crop_x1 - crop_x0 < 8 or crop_y1 - crop_y0 < 8:
        return None
    cropped = canvas.crop((crop_x0, crop_y0, crop_x1, crop_y1))
    cropped.info["tiles_fetched"] = tiles_fetched
    return cropped


def _fetch_wayback_tiles(
    lat: float,
    lng: float,
    delta: float,
    release_id: int,
    tile_size: int = 1536,
) -> Image.Image | None:
    """Fetch Esri Wayback tiles at a zoom whose native GSD fills tile_size pixels."""
    span_m = span_meters(delta)
    z = zoom_for_span(lat, span_m, tile_size, max_z=19)

    min_lat, max_lat = lat - delta, lat + delta
    min_lng, max_lng = lng - delta, lng + delta

    def ranges(zoom: int):
        x0, y0 = _lat_lng_to_tile(max_lat, min_lng, zoom)
        x1, y1 = _lat_lng_to_tile(min_lat, max_lng, zoom)
        return x0, y0, x1, y1

    x_min, y_min, x_max, y_max = ranges(z)
    while (x_max - x_min + 1) * (y_max - y_min + 1) > _MAX_TILES and z > 12:
        z -= 1
        x_min, y_min, x_max, y_max = ranges(z)

    url_fn = lambda tx, ty, zoom: (
        f"https://wayback.maptiles.arcgis.com/arcgis/rest/services/"
        f"World_Imagery/MapServer/tile/{release_id}/{zoom}/{ty}/{tx}"
    )
    mosaic = _assemble_mercator_mosaic(
        lat, lng, delta, z, x_min, y_min, x_max, y_max, url_fn
    )
    if mosaic is None:
        return None
    gsd = meters_per_pixel(lat, z)
    logger.info(
        "✅ Wayback release %s %d tiles at z=%d size=%s gsd=%.2fm",
        release_id,
        mosaic.info.get("tiles_fetched", "?"),
        z,
        mosaic.size,
        gsd,
    )
    return _annotate(
        mosaic,
        source="esri-wayback",
        release_id=release_id,
        zoom=z,
        gsd_m=round(gsd, 3),
        pixels=list(mosaic.size),
    )


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
    native_px = sentinel2_native_px(delta)
    # Keep small AOIs on the real EOX mosaic instead of failing the complete
    # request when Wayback has no usable historical tiles.
    out_px = max(256, min(_MAX_OUTPUT_PX, native_px))
    
    url = (
        f"https://tiles.maps.eox.at/wms?service=wms&request=getmap&version=1.1.1"
        f"&layers={layer}&styles=&format=image/jpeg&srs=epsg:4326"
        f"&bbox={bbox}&width={out_px}&height={out_px}"
    )
    try:
        resp = httpx.get(url, timeout=15.0)
        if resp.status_code == 200 and len(resp.content) > 2000:
            img = Image.open(io.BytesIO(resp.content)).convert("RGB")
            logger.info("✅ EOX %s for year %d (%s)", layer, year, img.size)
            return _annotate(img, source=f"eox-{layer}", gsd_m=_S2_GSD_M, pixels=list(img.size))
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
    tile_size: int = 1536,
    exclude_wayback_ids: set[int] | None = None,
    wayback_release_id: int | None = None,
) -> Image.Image:
    """
    Fetch dated real imagery. Small AOIs use Esri Wayback sub-meter tiles
    (native GSD at the chosen zoom). Sentinel-2 10 m is used only when it
    can fill the canvas without upsampling.
    """
    now_year = datetime.utcnow().year
    if target_dt is None:
        target_dt = datetime(now_year - (1 if role == "before" else 0), 6, 15)
    year = target_dt.year
    target_px = max(512, min(_MAX_OUTPUT_PX, tile_size))

    # Small/default investigations are faster and more reliable with the
    # real EOX mosaic than with dozens of historical Wayback tile requests.
    if sentinel2_native_px(delta) < 512:
        img = _fetch_eox_cloudless(lat, lng, delta, year, target_px)
        if img is not None:
            return img

    # 1. Dated high-resolution Wayback tiles (correct source for schools / small AOIs)
    if wayback_release_id is not None:
        release_id = wayback_release_id
        release_date = ""
    else:
        release_id, release_date = _pick_wayback_release_for_date(target_dt, exclude_wayback_ids)
    img = _fetch_wayback_tiles(lat, lng, delta, release_id, tile_size=target_px)
    if img is not None:
        return _annotate(img, **{**read_image_meta(img), "release_date": release_date, "role": role})

    # 2. Sentinel-2 Process API — only when 10 m native pixels are enough
    if target_dt:
        if role == "before":
            sh_from = target_dt - timedelta(days=20)
            sh_to = target_dt + timedelta(days=10)
        else:
            sh_from = target_dt - timedelta(days=10)
            sh_to = target_dt + timedelta(days=20)
        img = _fetch_sentinelhub_image(lat, lng, delta, sh_from, sh_to, target_px)
        if img is not None:
            return img

    # 3. EOX cloudless (10 m, year mosaic) — skipped for tiny AOIs inside the helper
    img = _fetch_eox_cloudless(lat, lng, delta, year, target_px)
    if img is not None:
        return img

    if settings.offline_mode:
        logger.warning("Offline mode — synthetic scene for %s", role)
        img = _simulate_scene(lat, lng, role, target_dt, change_type, delta, target_px)
        return _annotate(img, source="synthetic-offline", gsd_m=None, pixels=list(img.size))

    raise RuntimeError(
        f"No real satellite imagery was available for {role} at {lat:.5f},{lng:.5f} "
        f"around {target_dt.date()}. Wayback, Sentinel Hub, and EOX all failed."
    )


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
    tile_size: int = 1536,
    force_refresh: bool = False,
    time_period: str | None = None,
    exclude_wayback_ids: set[int] | None = None,
    wayback_release_id: int | None = None,
) -> Path:
    """Fetch dated real imagery and write a GeoTIFF. `time_period` is an alias for role."""
    if time_period and role == "after":
        role = time_period
    out_p = Path(output_path)
    meta_p = out_p.with_suffix(".json")
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
        exclude_wayback_ids=exclude_wayback_ids,
        wayback_release_id=wayback_release_id,
    )
    save_as_geotiff(img, out_p, lat, lng, delta=delta)
    meta = read_image_meta(img)
    meta.update({"width": img.size[0], "height": img.size[1], "role": role})
    meta_p.write_text(json.dumps(meta), encoding="utf-8")
    return out_p
