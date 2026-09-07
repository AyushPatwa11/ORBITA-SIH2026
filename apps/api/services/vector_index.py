"""
FAISS vector index over scene embeddings. IndexFlatIP (exact cosine search
via L2-normalized inner product) — no approximate-index tuning needed at
hackathon scale. Metadata (scene_id) lives in a JSON sidecar, not inside
FAISS, so it survives index rebuilds and is trivial to inspect.

Incremental by design: add() appends without rebuilding — matches the
"no full index rebuild on new imagery" requirement (spec §2.2.6).
"""

import json
from pathlib import Path

import faiss
import numpy as np

from ml.models.remote_clip import EMBED_DIM


class SceneVectorIndex:
    def __init__(self, index_dir: str):
        self.index_dir = Path(index_dir)
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self.index_path = self.index_dir / "scenes.faiss"
        self.meta_path = self.index_dir / "scenes_meta.json"

        if self.index_path.exists():
            self.index = faiss.read_index(str(self.index_path))
        else:
            self.index = faiss.IndexFlatIP(EMBED_DIM)

        self.scene_ids: list[str] = (
            json.loads(self.meta_path.read_text()) if self.meta_path.exists() else []
        )

    def add(self, scene_id: str, embedding: np.ndarray) -> None:
        vec = embedding.astype("float32").reshape(1, -1)
        faiss.normalize_L2(vec)
        self.index.add(vec)
        self.scene_ids.append(scene_id)
        self._persist()

    def search(self, query_embedding: np.ndarray, k: int = 10, exclude_scene_id: str | None = None):
        if self.index.ntotal == 0:
            return []
        vec = query_embedding.astype("float32").reshape(1, -1)
        faiss.normalize_L2(vec)
        fetch_k = min(self.index.ntotal, k + (1 if exclude_scene_id else 0))
        scores, indices = self.index.search(vec, fetch_k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self.scene_ids):
                continue
            scene_id = self.scene_ids[idx]
            if scene_id == exclude_scene_id:
                continue
            results.append((scene_id, float(score)))
            if len(results) >= k:
                break
        return results

    def _persist(self) -> None:
        faiss.write_index(self.index, str(self.index_path))
        self.meta_path.write_text(json.dumps(self.scene_ids))


_INDEX: SceneVectorIndex | None = None


def get_scene_index(index_dir: str) -> SceneVectorIndex:
    global _INDEX
    if _INDEX is None:
        _INDEX = SceneVectorIndex(index_dir)
    return _INDEX
