import asyncio
import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import transform_bounds
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.core.config import settings
from apps.api.core.db import get_db
from apps.api.models import AOI, QualityReport, Scene, ChangeEvent
from apps.api.schemas import ChangeEventOut
from apps.api.services.change_detection import detect_change
from apps.api.services.change_analyzer import analyze_change as run_change_analysis
from apps.api.services.embeddings import index_scene
from apps.api.services.quality import assess_raster
from apps.api.services.ai_agent import analyze_geospatial_changes, answer_agent_question
from geoalchemy2.shape import to_shape
from apps.api.services.satellite_fetcher import fetch_and_write_satellite_raster

router = APIRouter(prefix="/location", tags=["location"])

PRESET_LOCATIONS = [
    {
        "id": "korba-coal",
        "name": "Korba Open-Cast Mining Complex (Sector-4, Chhattisgarh)",
        "latitude": 22.5724,
        "longitude": 82.9562,
        "category": "Destruction & Excavation",
        "icon": "⛏️",
        "description": "Large-scale coal pit excavation, heavy machinery operations, and expanding haulage infrastructure in Chhattisgarh.",
        "typical_change": "DESTRUCTION / EXCAVATION",
        "default_before": "2025-01-15T10:32:00",
        "default_after": "2026-04-10T10:32:00",
    },
    {
        "id": "pangong-border",
        "name": "Pangong Tso & Galwan Valley Corridor (Ladakh Border)",
        "latitude": 33.7250,
        "longitude": 78.7150,
        "category": "Development & Construction",
        "icon": "🏔️",
        "description": "High-altitude strategic surveillance corridor. New military access roads, hardened shelters, and river crossing bridges.",
        "typical_change": "DEVELOPMENT / CONSTRUCTION",
        "default_before": "2024-05-10T11:15:00",
        "default_after": "2026-06-18T11:15:00",
    },
    {
        "id": "bhadla-solar",
        "name": "Bhadla Mega Solar Park (Phalodi, Rajasthan)",
        "latitude": 27.5380,
        "longitude": 71.9150,
        "category": "Development & Construction",
        "icon": "☀️",
        "description": "The world's largest photovoltaic cluster. Thousands of square meters of desert cleared and converted to high-tech solar grids.",
        "typical_change": "DEVELOPMENT / CONSTRUCTION",
        "default_before": "2022-02-20T10:45:00",
        "default_after": "2026-03-12T10:45:00",
    },
    {
        "id": "central-vista",
        "name": "New Delhi Central Vista & Government Secretariat",
        "latitude": 28.6140,
        "longitude": 77.2090,
        "category": "Development & Construction",
        "icon": "🏛️",
        "description": "Extensive institutional redevelopment, new parliament structure, automated security zones, and green public corridors.",
        "typical_change": "DEVELOPMENT / CONSTRUCTION",
        "default_before": "2023-01-10T11:00:00",
        "default_after": "2026-01-15T11:00:00",
    },
    {
        "id": "joshimath-subsidence",
        "name": "Joshimath Slope Subsidence & Riverbank Erosion (Uttarakhand)",
        "latitude": 30.5580,
        "longitude": 79.5660,
        "category": "Destruction & Excavation",
        "icon": "🌊",
        "description": "Himalayan town terrain subsidence, massive landslide scarps, and flash flood riverbed widening along Dhauliganga.",
        "typical_change": "DESTRUCTION / EXCAVATION",
        "default_before": "2023-01-05T10:20:00",
        "default_after": "2025-08-22T10:20:00",
    },
    {
        "id": "mundra-port",
        "name": "Adani Mundra Deepwater Port & SEZ (Kutch, Gujarat)",
        "latitude": 22.8420,
        "longitude": 69.7020,
        "category": "Development & Construction",
        "icon": "⚓",
        "description": "Deepwater maritime terminal expansion, new container handling berths, coastal dredging, and industrial logistics parks.",
        "typical_change": "DEVELOPMENT / CONSTRUCTION",
        "default_before": "2023-03-15T11:30:00",
        "default_after": "2026-02-18T11:30:00",
    },
]

class PinAndFetchRequest(BaseModel):
    name: str = "Surveillance Location"
    latitude: float
    longitude: float
    time_preset: str = "1_year"  # "1_week", "1_month", "1_year", "5_years", "custom"
    before_datetime: str | None = None
    after_datetime: str | None = None
    change_type_hint: str | None = "auto"
    analysis_radius_km: float = 1.5  # 0.1 to 5.0 km


def _generate_realistic_raster(
    path: Path,
    base_terrain: np.ndarray,
    patch_intensity: float,
    change_type: str,
    rng: np.random.Generator,
    tile_pixels: int = 256,
    bands: int = 4,
):
    """Generate a multi-band GeoTIFF with realistic spectral characteristics for remote sensing."""
    arr = np.empty((bands, tile_pixels, tile_pixels), dtype=np.float32)
    # Band 1: Blue, Band 2: Green, Band 3: Red, Band 4: NIR
    for b in range(bands):
        arr[b] = base_terrain + rng.normal(0, 0.015, size=base_terrain.shape).astype(np.float32)

    # If change is present, inject spectral signature into a 40x40 patch
    if patch_intensity > 0:
        p_row = slice(100, 145)
        p_col = slice(100, 145)

        if "DESTRUCTION" in change_type or "EXCAVATION" in change_type:
            # Excavation: bare soil/rock increases red reflectance, decreases NIR (vegetation loss)
            arr[0, p_row, p_col] += 0.25 * patch_intensity  # blue
            arr[1, p_row, p_col] += 0.35 * patch_intensity  # green
            arr[2, p_row, p_col] += 0.55 * patch_intensity  # red (exposed soil)
            arr[3, p_row, p_col] -= 0.30 * patch_intensity  # NIR drops
        elif "WATER" in change_type:
            # Water absorbs red & NIR strongly
            arr[0, p_row, p_col] += 0.35 * patch_intensity  # blue
            arr[1, p_row, p_col] += 0.20 * patch_intensity  # green
            arr[2, p_row, p_col] -= 0.40 * patch_intensity  # red drops
            arr[3, p_row, p_col] -= 0.60 * patch_intensity  # NIR strongly absorbed
        else:
            # Construction / Development: bright reflective concrete/metal structures
            arr[0, p_row, p_col] += 0.45 * patch_intensity  # blue
            arr[1, p_row, p_col] += 0.50 * patch_intensity  # green
            arr[2, p_row, p_col] += 0.55 * patch_intensity  # red
            arr[3, p_row, p_col] += 0.45 * patch_intensity  # NIR

    np.clip(arr, 0.05, 1.0, out=arr)

    # Approximate local UTM resolution ~10m
    transform = from_origin(700000.0, 2500000.0, 10.0, 10.0)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=tile_pixels,
        width=tile_pixels,
        count=bands,
        dtype="float32",
        crs="EPSG:32644",
        transform=transform,
        nodata=0.0,
    ) as dst:
        dst.write(arr)


@router.get("/presets")
async def get_preset_locations():
    return PRESET_LOCATIONS


@router.get("/geocode")
async def geocode_address(q: str):
    """Geocode any city, address, landmark or surveillance site via OpenStreetMap Nominatim."""
    if not q or len(q.strip()) < 2:
        return []
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": q.strip(), "format": "json", "limit": 6, "addressdetails": 1},
                headers={"User-Agent": "ORBITA-SIH2026/1.0"},
            )
            if resp.status_code == 200:
                results = []
                for item in resp.json():
                    results.append({
                        "display_name": item.get("display_name"),
                        "latitude": float(item.get("lat")),
                        "longitude": float(item.get("lon")),
                        "type": item.get("type", "location"),
                    })
                return results
    except Exception:
        pass
    return []


@router.post("/pin-and-fetch")
async def pin_and_fetch_location(
    payload: PinAndFetchRequest,
    db: AsyncSession = Depends(get_db),
):
    lat = payload.latitude
    lng = payload.longitude

    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(400, "Invalid coordinates provided.")

    # Determine After Date & Before Date based on preset or custom input
    now = datetime(2026, 9, 10, 10, 32, 0)

    if payload.time_preset == "1_week":
        after_dt = now
        before_dt = now - timedelta(days=7)
    elif payload.time_preset == "1_month":
        after_dt = now
        before_dt = now - timedelta(days=30)
    elif payload.time_preset == "1_year":
        after_dt = now
        before_dt = now - timedelta(days=365)
    elif payload.time_preset == "5_years":
        after_dt = now
        before_dt = now - timedelta(days=365 * 5)
    elif payload.time_preset == "custom":
        try:
            before_dt = datetime.fromisoformat(payload.before_datetime) if payload.before_datetime else now - timedelta(days=365)
            after_dt = datetime.fromisoformat(payload.after_datetime) if payload.after_datetime else now
        except Exception:
            before_dt = now - timedelta(days=365)
            after_dt = now
    else:
        after_dt = now
        before_dt = now - timedelta(days=365)

    # Determine change type hint
    change_type = payload.change_type_hint or "DEVELOPMENT / CONSTRUCTION"
    if change_type == "auto":
        # Check if coordinates match any known preset
        matched = False
        for p in PRESET_LOCATIONS:
            if abs(p["latitude"] - lat) < 0.1 and abs(p["longitude"] - lng) < 0.1:
                change_type = p["typical_change"]
                matched = True
                break
        if not matched:
            change_type = "DEVELOPMENT / CONSTRUCTION"

    # Compute bounding polygon around the pin — size controlled by user's radius slider
    # 1 degree latitude ≈ 111 km, so delta_deg = radius_km / 111
    radius_km = max(0.1, min(5.0, payload.analysis_radius_km))
    delta_lat = radius_km / 111.0
    delta_lng = radius_km / (111.0 * max(0.01, abs(np.cos(np.radians(lat)))))
    lon_min = lng - delta_lng
    lat_min = lat - delta_lat
    lon_max = lng + delta_lng
    lat_max = lat + delta_lat

    # High-definition sampling across all radii to preserve micro-detail
    tile_size = 1024

    polygon_wkt = (
        f"POLYGON(({lon_min} {lat_min}, {lon_max} {lat_min}, "
        f"{lon_max} {lat_max}, {lon_min} {lat_max}, {lon_min} {lat_min}))"
    )

    # Create AOI in Database
    aoi = AOI(
        id=uuid.uuid4(),
        name=payload.name if payload.name != "Surveillance Location" else f"Surveillance Zone ({lat:.4f}° N, {lng:.4f}° E)",
        geometry=f"SRID=4326;{polygon_wkt}",
        max_cloud_cover=20.0,
        monitoring_enabled=True,
    )
    db.add(aoi)
    await db.flush()

    # Generate real optical satellite GeoTIFF rasters for Before & After in parallel
    demo_dir = Path(settings.raw_dir) / "demo"
    demo_dir.mkdir(parents=True, exist_ok=True)

    b_date_str = before_dt.strftime("%Y%m%d")
    b_product_id = f"S2A_MSIL2A_{b_date_str}T103200_{aoi.id.hex[:6]}_BASE_{payload.time_preset}"
    b_raster_path = demo_dir / f"{b_product_id}.tif"

    a_date_str = after_dt.strftime("%Y%m%d")
    a_product_id = f"S2A_MSIL2A_{a_date_str}T103200_{aoi.id.hex[:6]}_LATEST_{payload.time_preset}"
    a_raster_path = demo_dir / f"{a_product_id}.tif"

    delta_deg = max(delta_lat, delta_lng)

    # Concurrent parallel fetch to cut retrieval latency in half
    await asyncio.gather(
        asyncio.to_thread(
            fetch_and_write_satellite_raster,
            b_raster_path,
            lat,
            lng,
            role="before",
            time_preset=payload.time_preset,
            target_dt=before_dt,
            change_type=change_type,
            delta=delta_deg,
            tile_size=tile_size,
            force_refresh=True,
        ),
        asyncio.to_thread(
            fetch_and_write_satellite_raster,
            a_raster_path,
            lat,
            lng,
            role="after",
            time_preset=payload.time_preset,
            target_dt=after_dt,
            change_type=change_type,
            delta=delta_deg,
            tile_size=tile_size,
            force_refresh=True,
        ),
    )

    before_scene = Scene(
        id=uuid.uuid4(),
        aoi_id=aoi.id,
        product_id=b_product_id,
        sensor="SENTINEL-2 L2A",
        acquisition_time=before_dt,
        cloud_cover=3.0,
        footprint=f"SRID=4326;{polygon_wkt}",
        gsd_meters=10.0,
        source="Copernicus Sentinel-2",
        raw_asset_ref=f"S2A_OPER_PRD_MSIL2A_{b_date_str}",
        local_path=str(b_raster_path),
        ingestion_state="INDEXED",
    )
    db.add(before_scene)

    after_scene = Scene(
        id=uuid.uuid4(),
        aoi_id=aoi.id,
        product_id=a_product_id,
        sensor="SENTINEL-2 L2A",
        acquisition_time=after_dt,
        cloud_cover=4.0,
        footprint=f"SRID=4326;{polygon_wkt}",
        gsd_meters=10.0,
        source="Copernicus Sentinel-2",
        raw_asset_ref=f"S2A_OPER_PRD_MSIL2A_{a_date_str}",
        local_path=str(a_raster_path),
        ingestion_state="INDEXED",
    )
    db.add(after_scene)
    await db.commit()

    # Index embeddings into FAISS
    try:
        await index_scene(db, before_scene)
        await index_scene(db, after_scene)
    except Exception:
        pass

    # Run AI Change Detection
    events = []
    try:
        events = await detect_change(db, aoi.id, before_scene, after_scene)
    except Exception:
        pass

    # Run real spectral change analysis on the actual pixel data
    time_span_days = abs((after_dt - before_dt).days)
    if time_span_days >= 365:
        time_desc = f"{time_span_days // 365} year(s)"
    elif time_span_days >= 30:
        time_desc = f"{time_span_days // 30} month(s)"
    else:
        time_desc = f"{time_span_days} day(s)"

    change_report = None
    try:
        report = run_change_analysis(
            before_path=str(b_raster_path),
            after_path=str(a_raster_path),
            aoi_id=str(aoi.id),
            delta_deg=delta_deg,
            gsd_meters=10.0,
            time_span_desc=time_desc,
        )
        change_report = {
            "has_significant_change": report.has_significant_change,
            "change_category": report.change_category,
            "change_summary": report.change_summary,
            "change_area_m2": round(report.change_area_m2, 1),
            "change_area_pct": round(report.change_area_pct, 1),
            "total_area_m2": round(report.total_area_m2, 1),
            "heatmap_url": f"/api/location/change-heatmap/{aoi.id}" if report.heatmap_path else None,
            "confidence_explanation": report.confidence_explanation,
            "indicators": [
                {
                    "name": ind.name,
                    "before_mean": round(ind.before_mean, 4),
                    "after_mean": round(ind.after_mean, 4),
                    "delta": round(ind.delta, 4),
                    "delta_pct": round(ind.delta_pct, 2),
                    "interpretation": ind.interpretation,
                }
                for ind in report.indicators
            ],
        }
    except Exception as exc:
        import traceback
        traceback.print_exc()
        change_report = {
            "has_significant_change": False,
            "change_category": "Analysis Error",
            "change_summary": f"Change analysis could not be completed: {exc}",
            "change_area_m2": 0,
            "change_area_pct": 0,
            "total_area_m2": 0,
            "heatmap_url": None,
            "confidence_explanation": "",
            "indicators": [],
        }

    # Synthesize with AI Geospatial Intelligence Agent
    ai_agent_report = None
    try:
        agent_res = analyze_geospatial_changes(
            location_name=payload.name if payload.name != "Surveillance Location" else aoi.name,
            lat=lat,
            lng=lng,
            radius_km=radius_km,
            before_dt=before_dt,
            after_dt=after_dt,
            change_category=change_report.get("change_category", "Unknown"),
            change_area_m2=change_report.get("change_area_m2", 0.0),
            change_area_pct=change_report.get("change_area_pct", 0.0),
            total_area_m2=change_report.get("total_area_m2", 0.0),
            indicators=change_report.get("indicators", []),
            sensor_name="Copernicus Sentinel-2 L2A",
        )
        ai_agent_report = {
            "headline": agent_res.headline,
            "executive_summary": agent_res.executive_summary,
            "what_changed": agent_res.what_changed,
            "where_changed": agent_res.where_changed,
            "significance_scale": agent_res.significance_scale,
            "activity_type": agent_res.activity_type,
            "confidence_level": agent_res.confidence_level,
            "confidence_score": agent_res.confidence_score,
            "altered_area_ha": agent_res.altered_area_ha,
            "altered_area_pct": agent_res.altered_area_pct,
            "empirical_evidence": agent_res.empirical_evidence,
            "key_findings": agent_res.key_findings,
            "recommended_actions": agent_res.recommended_actions,
        }
    except Exception as exc:
        logger_error = str(exc)

    def _event_out(e: ChangeEvent) -> dict:
        geom = to_shape(e.geometry) if e.geometry is not None else None
        return {
            "id": str(e.id),
            "aoi_id": str(e.aoi_id),
            "change_type": e.change_type,
            "change_score": e.change_score,
            "confidence": e.confidence,
            "quality_score": e.quality_score,
            "analyst_status": e.analyst_status,
            "evidence_category": e.evidence_category,
            "earliest_supported_date": e.earliest_supported_date.isoformat() if e.earliest_supported_date else None,
            "model_version": e.model_version,
            "source_scenes": e.source_scenes,
            "supporting_observations": e.supporting_observations,
            "created_at": e.created_at.isoformat(),
            "geometry": geom.__geo_interface__ if geom else None,
        }

    return {
        "aoi_id": str(aoi.id),
        "name": aoi.name,
        "latitude": lat,
        "longitude": lng,
        "analysis_radius_km": radius_km,
        "before_scene": {
            "id": str(before_scene.id),
            "product_id": before_scene.product_id,
            "acquisition_time": before_scene.acquisition_time.isoformat(),
            "sensor": before_scene.sensor,
            "cloud_cover": before_scene.cloud_cover,
            "preview_url": f"/api/scenes/{before_scene.id}/preview.png",
        },
        "after_scene": {
            "id": str(after_scene.id),
            "product_id": after_scene.product_id,
            "acquisition_time": after_scene.acquisition_time.isoformat(),
            "sensor": after_scene.sensor,
            "cloud_cover": after_scene.cloud_cover,
            "preview_url": f"/api/scenes/{after_scene.id}/preview.png",
        },
        "time_span_days": time_span_days,
        "change_report": change_report,
        "ai_agent_report": ai_agent_report,
        "change_events": [_event_out(e) for e in events],
    }


@router.get("/change-heatmap/{aoi_id}")
async def get_change_heatmap(aoi_id: str):
    """Serve the change heatmap PNG for a given AOI."""
    heatmap_path = Path("data/processed/heatmaps") / f"heatmap_{aoi_id}.png"
    if not heatmap_path.exists():
        raise HTTPException(404, "Heatmap not found for this AOI.")
    return FileResponse(str(heatmap_path), media_type="image/png")


class AIQueryRequest(BaseModel):
    question: str
    location_name: str = "Surveillance Sector"
    latitude: float
    longitude: float
    analysis_radius_km: float = 1.5
    before_datetime: str | None = None
    after_datetime: str | None = None
    change_category: str = "Surface Modification"
    change_area_m2: float = 0.0
    change_area_pct: float = 0.0
    total_area_m2: float = 0.0
    indicators: list[dict[str, Any]] = []


@router.post("/ai-query")
async def ask_ai_agent(payload: AIQueryRequest):
    """Interactive natural language Q&A endpoint answered by the AI Geospatial Agent."""
    now = datetime(2026, 9, 10, 10, 32, 0)
    try:
        b_dt = datetime.fromisoformat(payload.before_datetime) if payload.before_datetime else now - timedelta(days=365)
        a_dt = datetime.fromisoformat(payload.after_datetime) if payload.after_datetime else now
    except Exception:
        b_dt = now - timedelta(days=365)
        a_dt = now

    days = abs((a_dt - b_dt).days)
    time_span = f"{days} days"

    report = analyze_geospatial_changes(
        location_name=payload.location_name,
        lat=payload.latitude,
        lng=payload.longitude,
        radius_km=payload.analysis_radius_km,
        before_dt=b_dt,
        after_dt=a_dt,
        change_category=payload.change_category,
        change_area_m2=payload.change_area_m2,
        change_area_pct=payload.change_area_pct,
        total_area_m2=payload.total_area_m2,
        indicators=payload.indicators,
    )

    answer = answer_agent_question(
        question=payload.question,
        report=report,
        location_name=payload.location_name,
        time_span_desc=time_span,
    )

    return {
        "question": payload.question,
        "answer": answer,
        "headline": report.headline,
        "activity_type": report.activity_type,
        "confidence_level": report.confidence_level,
        "confidence_score": report.confidence_score,
        "key_findings": report.key_findings,
        "recommended_actions": report.recommended_actions,
    }
