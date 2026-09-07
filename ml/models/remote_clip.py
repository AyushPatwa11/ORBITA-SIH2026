"""
RemoteCLIP (Liu et al., IEEE TGRS 2024) — see docs/models/MODEL_SELECTION.md
for why this was chosen over generic CLIP.

RemoteCLIP fine-tunes the standard OpenCLIP ViT-B-32 architecture, so no
custom model code is needed: open_clip provides the architecture, and a
RemoteCLIP checkpoint (once staged locally) replaces the weights.

If no checkpoint is staged, this falls back to a randomly initialized
model with a loud warning — same honesty pattern as FC-Siam-Diff. Do not
demo embeddings from an unstaged model as if they were semantically
meaningful; they are for pipeline testing only.
"""

import logging
import os

import open_clip
import torch

logger = logging.getLogger(__name__)

MODEL_ARCH = "ViT-B-32"
EMBED_DIM = 512


class RemoteCLIP:
    def __init__(self, weights_path: str | None = None, device: str = "cpu"):
        self.device = device
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            MODEL_ARCH, pretrained=None
        )
        self.tokenizer = open_clip.get_tokenizer(MODEL_ARCH)
        self.weights_loaded = False

        if weights_path and os.path.exists(weights_path):
            state = torch.load(weights_path, map_location=device)
            self.model.load_state_dict(state)
            self.weights_loaded = True
            logger.info("RemoteCLIP checkpoint loaded from %s", weights_path)
        else:
            logger.warning(
                "RemoteCLIP checkpoint not found at %s — model is RANDOMLY "
                "INITIALIZED. Embeddings are not semantically meaningful; "
                "this is for pipeline testing only, never for a demo claim.",
                weights_path,
            )

        self.model.to(device).eval()

    @torch.no_grad()
    def embed_image(self, pil_image) -> torch.Tensor:
        tensor = self.preprocess(pil_image).unsqueeze(0).to(self.device)
        features = self.model.encode_image(tensor)
        return torch.nn.functional.normalize(features, dim=-1)[0].cpu()

    @torch.no_grad()
    def embed_text(self, text: str) -> torch.Tensor:
        tokens = self.tokenizer([text]).to(self.device)
        features = self.model.encode_text(tokens)
        return torch.nn.functional.normalize(features, dim=-1)[0].cpu()


_INSTANCE: RemoteCLIP | None = None


def get_remote_clip(weights_path: str | None = None, device: str = "cpu") -> RemoteCLIP:
    global _INSTANCE
    if _INSTANCE is None:
        _INSTANCE = RemoteCLIP(weights_path=weights_path, device=device)
    return _INSTANCE
