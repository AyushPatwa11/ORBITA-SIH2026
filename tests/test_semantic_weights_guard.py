import pytest

from apps.api.services import embeddings


class FakeClip:
    weights_loaded = False


def test_require_trained_remote_clip_checkpoint_raises_for_unloaded_weights():
    with pytest.raises(RuntimeError, match="RemoteCLIP checkpoint"):
        embeddings.require_trained_remote_clip(FakeClip())
