"""
Change Analyzer Service.
Compares actual pixel data between before/after satellite GeoTIFFs to produce
a structured change intelligence report with:
  - NDVI change (vegetation gain/loss)
  - Brightness/albedo change (construction, excavation, solar panels)
  - Built-up index change (urban development)
  - Human-readable description of what changed
  - Change heatmap PNG for visualization
"""

import io
import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

HEATMAP_DIR = Path("data/processed/heatmaps")
HEATMAP_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class SpectralIndicator:
    name: str
    before_mean: float
    after_mean: float
    delta: float
    delta_pct: float
    interpretation: str


@dataclass
class ChangeReport:
    has_significant_change: bool
    change_category: str  # e.g. "New Construction", "Deforestation", "Mining", etc.
    change_summary: str  # Human-readable paragraph
    change_area_m2: float
    change_area_pct: float  # % of total area that changed
    total_area_m2: float
    indicators: list[SpectralIndicator] = field(default_factory=list)
    heatmap_path: str | None = None
    confidence_explanation: str = ""


def _read_bands(tif_path: str | Path) -> np.ndarray | None:
    """Read GeoTIFF bands as float32 (bands, H, W). Returns None on failure."""
    import rasterio
    try:
        with rasterio.open(str(tif_path)) as src:
            data = src.read().astype(np.float32)
            return data
    except Exception as e:
        logger.warning("Cannot read raster %s: %s", tif_path, e)
        return None


def _compute_ndvi(bands: np.ndarray) -> np.ndarray:
    """Compute NDVI from bands. Expects bands[0]=B, [1]=G, [2]=R, [3]=NIR."""
    if bands.shape[0] >= 4:
        nir = bands[3]
        red = bands[2]
    else:
        # Approximate NIR from green channel if only 3 bands
        nir = bands[1] * 1.3 - bands[0] * 0.3
        red = bands[2] if bands.shape[0] >= 3 else bands[0]
    
    denom = nir + red + 1e-10
    ndvi = (nir - red) / denom
    return np.clip(ndvi, -1.0, 1.0)


def _compute_brightness(bands: np.ndarray) -> np.ndarray:
    """Compute average brightness across visible bands."""
    n_vis = min(3, bands.shape[0])
    return np.mean(bands[:n_vis], axis=0)


def _compute_builtup_index(bands: np.ndarray) -> np.ndarray:
    """Compute simplified Built-Up Index. Uses brightness vs NIR."""
    brightness = _compute_brightness(bands)
    if bands.shape[0] >= 4:
        nir = bands[3]
    else:
        nir = bands[1] * 1.3 - bands[0] * 0.3
    
    denom = brightness + nir + 1e-10
    ndbi = (brightness - nir) / denom
    return np.clip(ndbi, -1.0, 1.0)


def _generate_heatmap(diff_map: np.ndarray, output_path: Path, size: int = 512) -> None:
    """Generate a colorized heatmap PNG from a difference map."""
    # Normalize diff to 0-1
    d = diff_map.copy()
    p2, p98 = np.percentile(d, 2), np.percentile(d, 98)
    if p98 - p2 > 0.001:
        d = (d - p2) / (p98 - p2)
    else:
        d = np.zeros_like(d)
    d = np.clip(d, 0, 1)

    # Create a colormap: blue (no change) → yellow → red (strong change)
    h, w = d.shape
    rgb = np.zeros((h, w, 3), dtype=np.uint8)
    
    # Blue channel: high where no change
    rgb[:, :, 2] = ((1.0 - d) * 180).astype(np.uint8)
    # Red channel: high where change
    rgb[:, :, 0] = (d * 255).astype(np.uint8)
    # Green channel: peak at medium change
    rgb[:, :, 1] = (np.where(d > 0.5, (1.0 - d) * 2 * 180, d * 2 * 180)).astype(np.uint8)

    # Add transparency for very low change areas
    alpha = np.clip((d * 3.0), 0.15, 0.95)
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, :3] = rgb
    rgba[:, :, 3] = (alpha * 255).astype(np.uint8)

    img = Image.fromarray(rgba, mode="RGBA").resize((size, size), Image.LANCZOS)
    
    # Add legend text overlay
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except Exception:
        font = ImageFont.load_default()
    
    # Legend bar
    for i in range(100):
        x = size - 120 + i
        val = i / 100.0
        r = int(val * 255)
        b = int((1 - val) * 180)
        g = int(val * 2 * 180 if val < 0.5 else (1 - val) * 2 * 180)
        draw.line([(x, size - 30), (x, size - 18)], fill=(r, g, b, 255))
    
    draw.text((size - 125, size - 44), "Change Intensity", fill=(255, 255, 255, 220), font=font)
    draw.text((size - 120, size - 14), "Low", fill=(100, 100, 255, 200), font=font)
    draw.text((size - 35, size - 14), "High", fill=(255, 80, 80, 200), font=font)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(output_path), "PNG")


def _classify_change(
    ndvi_delta: float,
    brightness_delta: float,
    builtup_delta: float,
    change_pct: float,
) -> str:
    """Classify the type of change based on spectral indicators."""
    # Large brightness increase + builtup increase = construction/solar
    if brightness_delta > 0.03 and builtup_delta > 0.02:
        if brightness_delta > 0.08:
            return "Solar Panel / Reflective Installation"
        return "New Construction & Urban Development"
    
    # Large NDVI decrease = deforestation / land clearing
    if ndvi_delta < -0.05:
        if builtup_delta > 0.01:
            return "Land Clearing for Development"
        return "Vegetation Loss / Deforestation"
    
    # Large NDVI increase = regreening / farming
    if ndvi_delta > 0.05:
        return "Vegetation Growth / Agricultural Expansion"
    
    # Large brightness decrease = excavation / mining pit
    if brightness_delta < -0.04:
        return "Excavation / Mining Activity"
    
    # Moderate builtup increase
    if builtup_delta > 0.03:
        return "Infrastructure & Road Construction"
    
    # Small changes
    if change_pct < 5.0:
        return "Minimal / No Significant Change"
    
    return "Surface Modification (Mixed)"


def _generate_description(
    category: str,
    ndvi_delta: float,
    brightness_delta: float,
    builtup_delta: float,
    change_area_m2: float,
    change_pct: float,
    time_span_desc: str,
) -> str:
    """Generate a human-readable paragraph describing the detected changes."""
    area_str = f"{change_area_m2:,.0f} m²" if change_area_m2 < 10000 else f"{change_area_m2 / 10000:.2f} hectares"
    
    parts = []
    
    if change_pct < 3.0:
        parts.append(
            f"Analysis of satellite imagery over {time_span_desc} reveals minimal ground-level changes "
            f"in this area. Only {change_pct:.1f}% of the monitored zone (~{area_str}) shows measurable "
            f"spectral differences, which is within normal seasonal/atmospheric variation."
        )
        return " ".join(parts)
    
    parts.append(
        f"Satellite comparison over {time_span_desc} reveals significant ground changes "
        f"affecting approximately {area_str} ({change_pct:.1f}% of the monitored area)."
    )
    
    if "Construction" in category or "Development" in category:
        parts.append(
            f"Brightness increased by {abs(brightness_delta)*100:.1f}% and the built-up index "
            f"rose by {abs(builtup_delta)*100:.1f}%, consistent with new concrete, metal roofing, "
            f"or paved surfaces appearing in the scene."
        )
    
    if "Solar" in category or "Reflective" in category:
        parts.append(
            f"A strong albedo increase of {abs(brightness_delta)*100:.1f}% was detected, "
            f"characteristic of highly reflective materials such as solar panels, glass facades, "
            f"or metallic roofing installed during this period."
        )
    
    if "Vegetation" in category and ndvi_delta < 0:
        parts.append(
            f"NDVI (vegetation health index) dropped by {abs(ndvi_delta)*100:.1f}%, indicating "
            f"trees or ground cover were removed. This pattern is consistent with land clearing, "
            f"deforestation, or agricultural land conversion."
        )
    
    if "Vegetation" in category and ndvi_delta > 0:
        parts.append(
            f"NDVI (vegetation health index) increased by {abs(ndvi_delta)*100:.1f}%, indicating "
            f"new plant growth, reforestation, or agricultural crop emergence in the monitored area."
        )
    
    if "Excavation" in category or "Mining" in category:
        parts.append(
            f"Brightness decreased by {abs(brightness_delta)*100:.1f}%, suggesting soil excavation, "
            f"pit deepening, or removal of surface material. The dark spectral signature is consistent "
            f"with exposed rock/subsoil or water-filled pits."
        )
    
    if "Road" in category or "Infrastructure" in category:
        parts.append(
            f"The built-up index increased by {abs(builtup_delta)*100:.1f}%, indicating new linear "
            f"structures such as roads, pathways, or utility corridors appearing in the landscape."
        )
    
    if "Clearing" in category:
        parts.append(
            f"Combined vegetation loss (NDVI Δ = {ndvi_delta*100:+.1f}%) with increased built-up "
            f"signal suggests active land preparation — vegetation removed to make way for planned "
            f"construction or infrastructure development."
        )
    
    if "Minimal" in category:
        parts.append(
            "The spectral indicators are within normal atmospheric and seasonal variation ranges. "
            "No actionable ground-level development detected."
        )
    
    return " ".join(parts)


def analyze_change(
    before_path: str | Path,
    after_path: str | Path,
    aoi_id: str,
    delta_deg: float = 0.012,
    gsd_meters: float = 10.0,
    time_span_desc: str = "the selected period",
) -> ChangeReport:
    """
    Compare before/after GeoTIFFs and produce a structured ChangeReport
    with spectral analysis, human-readable description, and heatmap.
    """
    before_bands = _read_bands(before_path)
    after_bands = _read_bands(after_path)

    if before_bands is None or after_bands is None:
        return ChangeReport(
            has_significant_change=False,
            change_category="Analysis Failed",
            change_summary="Could not read one or both satellite images for comparison.",
            change_area_m2=0,
            change_area_pct=0,
            total_area_m2=0,
        )

    # Ensure same shape
    min_h = min(before_bands.shape[1], after_bands.shape[1])
    min_w = min(before_bands.shape[2], after_bands.shape[2])
    min_b = min(before_bands.shape[0], after_bands.shape[0])
    b = before_bands[:min_b, :min_h, :min_w]
    a = after_bands[:min_b, :min_h, :min_w]

    # Compute spectral indices
    ndvi_before = _compute_ndvi(b)
    ndvi_after = _compute_ndvi(a)
    ndvi_diff = ndvi_after - ndvi_before

    bright_before = _compute_brightness(b)
    bright_after = _compute_brightness(a)
    bright_diff = bright_after - bright_before

    builtup_before = _compute_builtup_index(b)
    builtup_after = _compute_builtup_index(a)
    builtup_diff = builtup_after - builtup_before

    # Composite change magnitude (Euclidean spectral distance)
    spectral_diff = np.sqrt(np.mean((a[:min(3, min_b)] - b[:min(3, min_b)]) ** 2, axis=0))

    # Determine change threshold adaptively
    p90 = float(np.percentile(spectral_diff, 90))
    change_threshold = max(0.05, min(0.25, p90 * 0.7))
    change_mask = spectral_diff > change_threshold

    # Compute statistics
    total_pixels = min_h * min_w
    changed_pixels = int(change_mask.sum())
    change_pct = (changed_pixels / total_pixels) * 100.0 if total_pixels > 0 else 0.0

    # Estimate area in m²
    pixel_area_m2 = gsd_meters ** 2
    total_area_m2 = total_pixels * pixel_area_m2
    change_area_m2 = changed_pixels * pixel_area_m2

    # Mean deltas
    ndvi_mean_delta = float(np.mean(ndvi_diff))
    bright_mean_delta = float(np.mean(bright_diff))
    builtup_mean_delta = float(np.mean(builtup_diff))

    # Only consider changed areas for meaningful delta
    if changed_pixels > 10:
        ndvi_change_delta = float(np.mean(ndvi_diff[change_mask]))
        bright_change_delta = float(np.mean(bright_diff[change_mask]))
        builtup_change_delta = float(np.mean(builtup_diff[change_mask]))
    else:
        ndvi_change_delta = ndvi_mean_delta
        bright_change_delta = bright_mean_delta
        builtup_change_delta = builtup_mean_delta

    # Classify
    category = _classify_change(ndvi_change_delta, bright_change_delta, builtup_change_delta, change_pct)
    has_significant = change_pct > 3.0

    # Indicators
    indicators = [
        SpectralIndicator(
            name="Vegetation Index (NDVI)",
            before_mean=float(np.mean(ndvi_before)),
            after_mean=float(np.mean(ndvi_after)),
            delta=ndvi_mean_delta,
            delta_pct=ndvi_mean_delta * 100,
            interpretation="Vegetation " + ("gained" if ndvi_mean_delta > 0.01 else "lost" if ndvi_mean_delta < -0.01 else "stable"),
        ),
        SpectralIndicator(
            name="Surface Brightness",
            before_mean=float(np.mean(bright_before)),
            after_mean=float(np.mean(bright_after)),
            delta=bright_mean_delta,
            delta_pct=bright_mean_delta * 100,
            interpretation="Brightness " + ("increased" if bright_mean_delta > 0.01 else "decreased" if bright_mean_delta < -0.01 else "stable"),
        ),
        SpectralIndicator(
            name="Built-Up Index (NDBI)",
            before_mean=float(np.mean(builtup_before)),
            after_mean=float(np.mean(builtup_after)),
            delta=builtup_mean_delta,
            delta_pct=builtup_mean_delta * 100,
            interpretation="Urban features " + ("expanded" if builtup_mean_delta > 0.01 else "reduced" if builtup_mean_delta < -0.01 else "stable"),
        ),
    ]

    # Generate heatmap
    heatmap_filename = f"heatmap_{aoi_id}.png"
    heatmap_path = HEATMAP_DIR / heatmap_filename
    try:
        _generate_heatmap(spectral_diff, heatmap_path)
    except Exception as e:
        logger.warning("Failed to generate heatmap: %s", e)
        heatmap_path = None

    # Description
    description = _generate_description(
        category, ndvi_change_delta, bright_change_delta,
        builtup_change_delta, change_area_m2, change_pct, time_span_desc,
    )

    # Confidence explanation
    if has_significant:
        conf_str = (
            f"Spectral differences were detected across {change_pct:.1f}% of the area. "
            f"The change threshold ({change_threshold:.3f}) was adaptively set based on "
            f"the 90th percentile of pixel-level spectral distance."
        )
    else:
        conf_str = (
            f"Only {change_pct:.1f}% of pixels exceeded the change threshold. "
            f"This is below the 3% significance level and may represent noise or atmospheric variation."
        )

    return ChangeReport(
        has_significant_change=has_significant,
        change_category=category,
        change_summary=description,
        change_area_m2=change_area_m2,
        change_area_pct=change_pct,
        total_area_m2=total_area_m2,
        indicators=indicators,
        heatmap_path=str(heatmap_path) if heatmap_path else None,
        confidence_explanation=conf_str,
    )
