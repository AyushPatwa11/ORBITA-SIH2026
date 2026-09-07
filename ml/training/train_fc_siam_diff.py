"""
Trains FC-Siam-Diff on the OSCD (Onera Satellite Change Detection)
dataset. Not run automatically — this repo ships no pretrained weights
(see docs/models/MODEL_CARD.md).

Expected layout (standard OSCD release):
  <oscd_root>/<city>/imgs_1_rect/*.tif   (before, multi-band)
  <oscd_root>/<city>/imgs_2_rect/*.tif   (after)
  <oscd_root>/<city>/cm/<city>-cm.tif    (binary change mask, 1=change)
  <oscd_root>/train.txt                 (one city name per line)
  <oscd_root>/test.txt

Usage:
  python -m ml.training.train_fc_siam_diff --oscd-root /data/raw/oscd --epochs 40
"""

import argparse
from pathlib import Path

import numpy as np
import rasterio
import torch
from torch.utils.data import DataLoader, Dataset

from ml.models.fc_siam_diff import FCSiamDiff

PATCH_SIZE = 256


class OSCDDataset(Dataset):
    def __init__(self, oscd_root: Path, split_file: str, patch_size: int = PATCH_SIZE):
        self.root = oscd_root
        self.patch_size = patch_size
        self.cities = [
            line.strip() for line in (oscd_root / split_file).read_text().splitlines() if line.strip()
        ]

    def __len__(self):
        return len(self.cities)

    def _read_stack(self, path: Path) -> np.ndarray:
        with rasterio.open(path) as src:
            arr = src.read().astype(np.float32)
        return arr / 10000.0  # Sentinel-2 L2A reflectance scaling

    def __getitem__(self, idx):
        city = self.cities[idx]
        before_path = next((self.root / city / "imgs_1_rect").glob("*.tif"))
        after_path = next((self.root / city / "imgs_2_rect").glob("*.tif"))
        cm_path = self.root / city / "cm" / f"{city}-cm.tif"

        before = self._read_stack(before_path)
        after = self._read_stack(after_path)
        with rasterio.open(cm_path) as src:
            cm = src.read(1).astype(np.float32)
            cm = (cm > 0).astype(np.float32)  # OSCD label convention: 1/2 -> binarize

        # center-crop/pad to a fixed patch for batching
        before = _fit_to_patch(before, self.patch_size)
        after = _fit_to_patch(after, self.patch_size)
        cm = _fit_to_patch(cm[None], self.patch_size)[0]

        return torch.from_numpy(before), torch.from_numpy(after), torch.from_numpy(cm)


def _fit_to_patch(arr: np.ndarray, size: int) -> np.ndarray:
    c, h, w = arr.shape
    out = np.zeros((c, size, size), dtype=np.float32)
    ch, cw = min(h, size), min(w, size)
    out[:, :ch, :cw] = arr[:, :ch, :cw]
    return out


def dice_loss(logits: torch.Tensor, target: torch.Tensor, eps: float = 1e-6) -> torch.Tensor:
    prob = torch.sigmoid(logits)
    intersection = (prob * target).sum()
    union = prob.sum() + target.sum()
    return 1 - (2 * intersection + eps) / (union + eps)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--oscd-root", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--in-channels", type=int, default=4)
    parser.add_argument("--out", type=Path, default=Path("ml/inference/weights/fc_siam_diff.pt"))
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"

    train_ds = OSCDDataset(args.oscd_root, "train.txt")
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=2)

    model = FCSiamDiff(in_channels=args.in_channels).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    bce = torch.nn.BCEWithLogitsLoss()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    best_loss = float("inf")

    for epoch in range(args.epochs):
        model.train()
        epoch_loss = 0.0
        for before, after, target in train_loader:
            before, after, target = before.to(device), after.to(device), target.to(device)
            optimizer.zero_grad()
            logits = model(before, after)[:, 0]
            loss = bce(logits, target) + dice_loss(logits, target)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()

        avg_loss = epoch_loss / max(len(train_loader), 1)
        print(f"epoch {epoch+1}/{args.epochs} — loss {avg_loss:.4f}")

        if avg_loss < best_loss:
            best_loss = avg_loss
            torch.save(model.state_dict(), args.out)

    print(f"Best training loss: {best_loss:.4f}. Weights saved to {args.out}")
    print("Run the OSCD evaluation script before claiming any accuracy number.")


if __name__ == "__main__":
    main()
