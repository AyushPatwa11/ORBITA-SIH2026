"""
FC-Siam-Diff: fully convolutional Siamese network, feature-difference
variant (Daudt, Le Saux, Boulch, 2018 — "Fully Convolutional Siamese
Networks for Change Detection"). Chosen as the baseline over
ChangeFormer/ChangeViT for this project because it trains and infers
on a single consumer GPU in reasonable time and is well documented —
see docs/models/MODEL_SELECTION.md for the comparison.

Two encoder passes share weights (Siamese). At each skip-connection
level the absolute difference of the two feature maps is concatenated
into the decoder — this is the "Diff" variant, versus "Conc" which
concatenates raw features instead of their difference.
"""

import torch
import torch.nn as nn


def conv_block(in_ch: int, out_ch: int) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(in_ch, out_ch, 3, padding=1),
        nn.BatchNorm2d(out_ch),
        nn.ReLU(inplace=True),
        nn.Conv2d(out_ch, out_ch, 3, padding=1),
        nn.BatchNorm2d(out_ch),
        nn.ReLU(inplace=True),
    )


class FCSiamDiff(nn.Module):
    def __init__(self, in_channels: int = 4, num_classes: int = 1, base_ch: int = 16):
        """
        in_channels: bands per image (e.g. 4 for Sentinel-2 R,G,B,NIR)
        num_classes: 1 for binary change probability (sigmoid)
        """
        super().__init__()
        c1, c2, c3, c4 = base_ch, base_ch * 2, base_ch * 4, base_ch * 8

        self.enc1 = conv_block(in_channels, c1)
        self.enc2 = conv_block(c1, c2)
        self.enc3 = conv_block(c2, c3)
        self.enc4 = conv_block(c3, c4)
        self.pool = nn.MaxPool2d(2)

        self.bottleneck = conv_block(c4, c4 * 2)

        self.up4 = nn.ConvTranspose2d(c4 * 2, c4, 2, stride=2)
        self.dec4 = conv_block(c4 * 2, c4)  # + diff skip (c4)
        self.up3 = nn.ConvTranspose2d(c4, c3, 2, stride=2)
        self.dec3 = conv_block(c3 * 2, c3)
        self.up2 = nn.ConvTranspose2d(c3, c2, 2, stride=2)
        self.dec2 = conv_block(c2 * 2, c2)
        self.up1 = nn.ConvTranspose2d(c2, c1, 2, stride=2)
        self.dec1 = conv_block(c1 * 2, c1)

        self.head = nn.Conv2d(c1, num_classes, 1)

    def _encode(self, x):
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))
        e4 = self.enc4(self.pool(e3))
        b = self.bottleneck(self.pool(e4))
        return e1, e2, e3, e4, b

    def forward(self, before: torch.Tensor, after: torch.Tensor) -> torch.Tensor:
        b1, b2, b3, b4, bb = self._encode(before)
        a1, a2, a3, a4, ab = self._encode(after)

        d4 = torch.abs(b4 - a4)
        d3 = torch.abs(b3 - a3)
        d2 = torch.abs(b2 - a2)
        d1 = torch.abs(b1 - a1)
        bottleneck_diff = torch.abs(bb - ab)

        x = self.up4(bottleneck_diff)
        if x.shape[2:] != d4.shape[2:]:
            x = torch.nn.functional.interpolate(x, size=d4.shape[2:], mode="bilinear", align_corners=False)
        x = self.dec4(torch.cat([x, d4], dim=1))
        x = self.up3(x)
        if x.shape[2:] != d3.shape[2:]:
            x = torch.nn.functional.interpolate(x, size=d3.shape[2:], mode="bilinear", align_corners=False)
        x = self.dec3(torch.cat([x, d3], dim=1))
        x = self.up2(x)
        if x.shape[2:] != d2.shape[2:]:
            x = torch.nn.functional.interpolate(x, size=d2.shape[2:], mode="bilinear", align_corners=False)
        x = self.dec2(torch.cat([x, d2], dim=1))
        x = self.up1(x)
        if x.shape[2:] != d1.shape[2:]:
            x = torch.nn.functional.interpolate(x, size=d1.shape[2:], mode="bilinear", align_corners=False)
        x = self.dec1(torch.cat([x, d1], dim=1))

        return self.head(x)  # logits, shape (B, num_classes, H, W)
