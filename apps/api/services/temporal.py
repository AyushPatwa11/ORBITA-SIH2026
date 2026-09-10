"""
Phase 4 — multi-temporal persistence and false-alarm suppression (§15,
§16, §17). This deliberately uses interpretable rule-based logic, not
an ML model, per the spec: "Implement this first using interpretable
statistical/rule-based methods."

Workflow for one change_event:
  baseline scene + every later INDEXED scene in the AOI
    -> align each to baseline, measure mean change-probability inside
       the event's geometry
    -> classify each observation: EXCLUDED (poor quality) / NONE /
       POSSIBLE / CONFIRMED (persists across later observations)
    -> earliest_supported_date = earliest POSSIBLE observation that is
       later confirmed by persistence, never "earliest raw detection"
    -> seasonality check: if a "change" signal only ever appears in the
       same calendar months across multiple years, it's flagged as a
       likely seasonal/vegetation false alarm rather than real change
"""

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

import numpy as np
from geoalchemy2.shape import to_shape
from rasterio.features import geometry_mask
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models import ChangeEvent, ChangeObservation, QualityReport, Scene
from apps.api.services.alignment import align_pair
from ml.inference.change_inference import CHANGE_PROB_THRESHOLD, load_model

PERSISTENCE_MIN_LATER_CONFIRMATIONS = 2
MIN_OBSERVATIONS_FOR_CONCLUSION = 3
MIN_YEARS_FOR_SEASONALITY_CHECK = 2

_MODEL_CACHE: dict[str, object] = {}


def _get_model():
    if "default" not in _MODEL_CACHE:
        _MODEL_CACHE["default"] = load_model(weights_path=None)
    return _MODEL_CACHE["default"]


@dataclass
class TimelinePoint:
    scene_id: uuid.UUID
    timestamp: datetime
    quality_status: str
    change_probability: float | None
    observation_status: str  # NONE, POSSIBLE, CONFIRMED, EXCLUDED


async def _candidate_scenes(db: AsyncSession, aoi_id: uuid.UUID, exclude_scene_id: uuid.UUID) -> list[Scene]:
    result = await db.execute(
        select(Scene)
        .where(Scene.aoi_id == aoi_id, Scene.ingestion_state == "INDEXED", Scene.id != exclude_scene_id)
        .order_by(Scene.acquisition_time.asc())
    )
    return list(result.scalars().all())


def _mean_probability_in_geometry(prob_map: np.ndarray, transform, geometry_wkt_shape) -> float:
    mask = geometry_mask(
        [geometry_wkt_shape], transform=transform, out_shape=prob_map.shape, invert=True
    )
    if not mask.any():
        return 0.0
    return float(prob_map[mask].mean())


async def build_timeline(db: AsyncSession, event: ChangeEvent, baseline: Scene) -> list[TimelinePoint]:
    from ml.inference.change_inference import run_change_inference

    geometry = to_shape(event.geometry)
    candidates = await _candidate_scenes(db, event.aoi_id, baseline.id)
    model = _get_model()

    timeline: list[TimelinePoint] = []
    for scene in candidates:
        qr_res = await db.execute(select(QualityReport).where(QualityReport.scene_id == scene.id))
        qr = qr_res.scalar_one_or_none()
        quality_status = qr.status if qr else "UNKNOWN"
        if quality_status == "UNUSABLE" or not scene.local_path:
            timeline.append(
                TimelinePoint(scene.id, scene.acquisition_time, quality_status, None, "EXCLUDED")
            )
            continue

        aligned = align_pair(baseline.local_path, scene.local_path)
        if not aligned.accepted:
            timeline.append(
                TimelinePoint(scene.id, scene.acquisition_time, quality_status, None, "EXCLUDED")
            )
            continue

        prob_map, _ = run_change_inference(
            model, aligned.before, aligned.after, aligned.valid_mask, aligned.transform, aligned.crs
        )
        mean_prob = _mean_probability_in_geometry(prob_map, aligned.transform, geometry)
        status = "POSSIBLE" if mean_prob >= CHANGE_PROB_THRESHOLD else "NONE"
        timeline.append(
            TimelinePoint(scene.id, scene.acquisition_time, quality_status, round(mean_prob, 3), status)
        )

    timeline.sort(key=lambda p: p.timestamp)
    return timeline


def apply_persistence(timeline: list[TimelinePoint]) -> tuple[list[TimelinePoint], datetime | None]:
    """
    Upgrades POSSIBLE -> CONFIRMED where enough later good-quality
    observations also show change. Returns the earliest timestamp among
    points that end up CONFIRMED (the "earliest supported observation").
    """
    good = [p for p in timeline if p.observation_status != "EXCLUDED"]
    earliest: datetime | None = None

    for i, point in enumerate(good):
        if point.observation_status != "POSSIBLE":
            continue
        later = good[i + 1 :]
        confirmations = sum(1 for lp in later if lp.observation_status in ("POSSIBLE", "CONFIRMED"))
        enough_later_evidence = confirmations >= PERSISTENCE_MIN_LATER_CONFIRMATIONS or (
            len(later) > 0 and confirmations == len(later)
        )
        if enough_later_evidence:
            point.observation_status = "CONFIRMED"
            if earliest is None or point.timestamp < earliest:
                earliest = point.timestamp

    return timeline, earliest


def detect_seasonality(timeline: list[TimelinePoint]) -> bool:
    """
    Rule-based: flags a change signal as likely seasonal if the same
    calendar month shows change-probability above threshold in at least
    two distinct years, while other months in the record stay below
    threshold — the classic recurring-vegetation-cycle pattern rather
    than a one-off structural change.
    """
    points_with_prob = [p for p in timeline if p.change_probability is not None]
    years = {p.timestamp.year for p in points_with_prob}
    if len(years) < MIN_YEARS_FOR_SEASONALITY_CHECK:
        return False  # not enough history to distinguish seasonal from real

    by_month: dict[int, list[TimelinePoint]] = defaultdict(list)
    for p in points_with_prob:
        by_month[p.timestamp.month].append(p)

    month_avg = {m: sum(p.change_probability for p in pts) / len(pts) for m, pts in by_month.items()}
    high_months = [m for m, avg in month_avg.items() if avg >= CHANGE_PROB_THRESHOLD]
    low_months = [m for m, avg in month_avg.items() if avg < CHANGE_PROB_THRESHOLD]

    if not high_months or not low_months:
        return False  # no month/season contrast to speak of

    for m in high_months:
        years_above = {
            p.timestamp.year for p in by_month[m] if p.change_probability >= CHANGE_PROB_THRESHOLD
        }
        if len(years_above) < MIN_YEARS_FOR_SEASONALITY_CHECK:
            return False  # this high month isn't actually recurring — don't flag

    return True


def categorize_evidence(timeline: list[TimelinePoint], seasonal: bool) -> str:
    good = [p for p in timeline if p.observation_status != "EXCLUDED"]
    if seasonal:
        return "LIKELY_FALSE_CHANGE"
    if any(p.observation_status == "CONFIRMED" for p in good):
        return "LIKELY_TRUE_CHANGE"
    if any(p.observation_status == "POSSIBLE" for p in good):
        return "POSSIBLE_CHANGE"
    if len(good) < MIN_OBSERVATIONS_FOR_CONCLUSION:
        return "INSUFFICIENT_EVIDENCE"
    return "LIKELY_FALSE_CHANGE"


async def run_temporal_analysis(db: AsyncSession, event: ChangeEvent) -> dict:
    baseline_scene_id = next(
        (o["scene_id"] for o in event.supporting_observations if o.get("role") == "before"), None
    )
    if baseline_scene_id is None:
        raise ValueError("Change event has no recorded baseline ('before') scene.")
    baseline = await db.get(Scene, uuid.UUID(baseline_scene_id))
    if not baseline:
        raise ValueError("Baseline scene no longer exists.")

    timeline = await build_timeline(db, event, baseline)
    timeline, earliest = apply_persistence(timeline)
    seasonal = detect_seasonality(timeline)
    evidence_category = categorize_evidence(timeline, seasonal)

    for p in timeline:
        db.add(
            ChangeObservation(
                id=uuid.uuid4(),
                change_event_id=event.id,
                scene_id=p.scene_id,
                observed_at=p.timestamp,
                change_probability=p.change_probability,
                quality_status=p.quality_status,
                observation_status=p.observation_status,
            )
        )

    event.earliest_supported_date = earliest
    event.evidence_category = evidence_category
    if seasonal:
        # confidence adjustment — a flagged seasonal pattern should never
        # read as strong evidence of real change (§16)
        event.confidence = round(event.confidence * 0.3, 3)

    await db.commit()

    return {
        "evidence_category": evidence_category,
        "earliest_supported_date": earliest,
        "seasonal_pattern_detected": seasonal,
        "timeline": timeline,
    }
