"""Process-local fallback when Postgres/PostGIS is not running."""

from __future__ import annotations

import uuid

from apps.api.models import AOI, Scene

_AOIS: dict[uuid.UUID, AOI] = {}
_SCENES: dict[uuid.UUID, Scene] = {}


def remember_aoi(aoi: AOI) -> None:
    _AOIS[aoi.id] = aoi


def remember_scene(scene: Scene) -> None:
    _SCENES[scene.id] = scene


def get_aoi(aoi_id: uuid.UUID) -> AOI | None:
    return _AOIS.get(aoi_id)


def get_scene(scene_id: uuid.UUID) -> Scene | None:
    return _SCENES.get(scene_id)


def list_scenes_for_aoi(aoi_id: uuid.UUID) -> list[Scene]:
    scenes = [s for s in _SCENES.values() if s.aoi_id == aoi_id]
    scenes.sort(key=lambda s: s.acquisition_time, reverse=True)
    return scenes
