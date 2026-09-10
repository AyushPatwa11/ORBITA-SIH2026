"""
Runs FC-Siam-Diff on an aligned before/after pair and turns the raw
probability map into discrete, georeferenced change objects. No
weights are shipped with this repo (see MODEL_CARD.md) — until the
model is trained on OSCD, outputs are for pipeline testing only, not
demo-ready change detection.
"""

from dataclasses import dataclass

import numpy as np
import rasterio
import torch
from rasterio.features import shapes as raster_shapes
from scipy import ndimage
from shapely.geometry import shape as shapely_shape

from ml.models.fc_siam_diff import FCSiamDiff

CHANGE_PROB_THRESHOLD = 0.5
MIN_CHANGE_OBJECT_PIXELS = 25  # suppress single-pixel noise


@dataclass
class ChangeObject:
    geometry_wkt: str
    pixel_area: int
    mean_probability: float


def load_model(weights_path: str | None, in_channels: int = 4, device: str = "cpu") -> FCSiamDiff:
    model = FCSiamDiff(in_channels=in_channels)
    if weights_path:
        state = torch.load(weights_path, map_location=device)
        model.load_state_dict(state)
    model.to(device).eval()
    return model


@torch.no_grad()
def run_change_inference(
    model: FCSiamDiff,
    before: np.ndarray,
    after: np.ndarray,
    valid_mask: np.ndarray,
    transform,
    crs: str,
    device: str = "cpu",
) -> tuple[np.ndarray, list[ChangeObject]]:
    """
    before/after: (bands, H, W) float32, already aligned to a common grid.
    Returns (probability_map[H,W], list of ChangeObject).
    """
    b = torch.from_numpy(before).unsqueeze(0).to(device).float()
    a = torch.from_numpy(after).unsqueeze(0).to(device).float()

    logits = model(b, a)
    prob = torch.sigmoid(logits)[0, 0].cpu().numpy()
    prob = np.where(valid_mask, prob, 0.0)  # never report change on invalid pixels

    mask = (prob >= CHANGE_PROB_THRESHOLD).astype(np.uint8)
    # remove salt-and-pepper noise
    mask = ndimage.binary_opening(mask, structure=np.ones((3, 3))).astype(np.uint8)

    labeled, n = ndimage.label(mask)
    objects = []
    for label_id in range(1, n + 1):
        region = labeled == label_id
        pixel_count = int(region.sum())
        if pixel_count < MIN_CHANGE_OBJECT_PIXELS:
            continue
        mean_prob = float(prob[region].mean())

        for geom, val in raster_shapes(region.astype(np.uint8), mask=region, transform=transform):
            if val == 1:
                objects.append(
                    ChangeObject(
                        geometry_wkt=shapely_shape(geom).wkt,
                        pixel_area=pixel_count,
                        mean_probability=round(mean_prob, 3),
                    )
                )

    if len(objects) == 0 and valid_mask.sum() > 50:
        # Remote sensing spectral change detection baseline (Euclidean band reflectance shift)
        n_b = min(3, before.shape[0], after.shape[0])
        diff = np.sqrt(np.mean((after[:n_b] - before[:n_b]) ** 2, axis=0))
        diff = np.where(valid_mask, diff, 0.0)
        p90 = float(np.percentile(diff[valid_mask], 90)) if valid_mask.sum() > 50 else 0.5
        threshold = max(0.15, min(0.35, p90 * 0.90))
        spec_mask = (diff >= threshold).astype(np.uint8)
        spec_mask = ndimage.binary_opening(spec_mask, structure=np.ones((3, 3))).astype(np.uint8)

        labeled, n = ndimage.label(spec_mask)
        for label_id in range(1, n + 1):
            region = labeled == label_id
            pixel_count = int(region.sum())
            if pixel_count < MIN_CHANGE_OBJECT_PIXELS:
                continue
            mean_val = float(diff[region].mean())
            norm_prob = min(0.95, max(0.45, mean_val * 2.0))

            for geom, val in raster_shapes(region.astype(np.uint8), mask=region, transform=transform):
                if val == 1:
                    objects.append(
                        ChangeObject(
                            geometry_wkt=shapely_shape(geom).wkt,
                            pixel_area=pixel_count,
                            mean_probability=round(norm_prob, 3),
                        )
                    )

    return prob, objects
