"""
Ties the RemoteCLIP wrapper, a scene's rendered RGB image, and the FAISS
index together. This is the real semantic-retrieval pipeline (spec
§2.2.1) — text-to-image and image-to-image search both run through here.
Embedding quality is only as good as the staged checkpoint; see
docs/models/MODEL_SELECTION.md for the honest caveat on that.
"""

import io

from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.core.config import settings
from apps.api.models import Scene
from apps.api.services.preview import render_rgb_preview
from apps.api.services.vector_index import get_scene_index
from ml.models.remote_clip import get_remote_clip


import logging

logger = logging.getLogger(__name__)


def require_trained_remote_clip(clip) -> None:
    """Check RemoteCLIP checkpoint status.
    Logs explicit warning if checkpoint is not staged, but preserves pipeline execution
    with clear weights_loaded provenance in every response.
    """
    if not getattr(clip, "weights_loaded", False):
        logger.warning(
            "RemoteCLIP checkpoint not found at %s. Using baseline OpenCLIP embeddings. "
            "weights_loaded is flagged as False in responses.",
            settings.remote_clip_weights_path,
        )


def _clip():
    return get_remote_clip(weights_path=settings.remote_clip_weights_path)


def _index():
    return get_scene_index(settings.index_dir)


async def index_scene(db: AsyncSession, scene: Scene) -> dict:
    if not scene.local_path:
        raise ValueError("Scene has no downloaded raster to embed.")

    clip = _clip()
    require_trained_remote_clip(clip)

    png_bytes = render_rgb_preview(scene.local_path, max_size=224)
    image = Image.open(io.BytesIO(png_bytes)).convert("RGB")

    embedding = clip.embed_image(image).numpy()
    _index().add(str(scene.id), embedding)

    scene.embedding_indexed = True
    await db.commit()

    return {
        "scene_id": str(scene.id),
        "weights_loaded": clip.weights_loaded,
        "embedding_dim": int(embedding.shape[0]),
    }


async def semantic_search(db: AsyncSession, query: str, k: int, aoi_id: str | None) -> list[dict]:
    clip = _clip()
    require_trained_remote_clip(clip)

    query_embedding = clip.embed_text(query).numpy()
    matches = _index().search(query_embedding, k=k * 3 if aoi_id else k)

    results = []
    for scene_id, score in matches:
        scene = await db.get(Scene, scene_id)
        if scene is None:
            continue
        if aoi_id and str(scene.aoi_id) != aoi_id:
            continue
        results.append(
            {
                "scene_id": str(scene.id),
                "product_id": scene.product_id,
                "acquisition_time": scene.acquisition_time,
                "similarity": score,
                "weights_loaded": clip.weights_loaded,
            }
        )
        if len(results) >= k:
            break
    return results


async def find_similar_scenes(db: AsyncSession, scene: Scene, k: int) -> list[dict]:
    if not scene.embedding_indexed:
        await index_scene(db, scene)

    png_bytes = render_rgb_preview(scene.local_path, max_size=224)
    image = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    clip = _clip()
    embedding = clip.embed_image(image).numpy()

    matches = _index().search(embedding, k=k, exclude_scene_id=str(scene.id))

    results = []
    for scene_id, score in matches:
        candidate = await db.get(Scene, scene_id)
        if candidate is None:
            continue
        results.append(
            {
                "scene_id": str(candidate.id),
                "product_id": candidate.product_id,
                "acquisition_time": candidate.acquisition_time,
                "similarity": score,
                "weights_loaded": clip.weights_loaded,
            }
        )
    return results
