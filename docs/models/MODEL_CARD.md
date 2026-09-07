# Model Card: FC-Siam-Diff (Change Detection)

**Status: architecture implemented, NOT trained.** No weights ship with
this repo. Running inference without training on OSCD first produces
outputs from randomly initialized weights — useful only for testing the
pipeline end-to-end (shapes, alignment, DB writes), never for a demo
claim about detection quality.

## Architecture
Siamese fully-convolutional encoder-decoder (Daudt et al., 2018),
feature-difference variant. Shared-weight encoder run twice (before/
after); absolute difference of encoder features at each resolution is
concatenated into the decoder skip connections.

## Training data (once run)
OSCD (Onera Satellite Change Detection), Sentinel-2, bi-temporal,
pixel-level binary change labels. **License must be verified against
intended use before training** — see `docs/data/DATASET_INVENTORY.md`
(to be completed alongside training).

## Input / Output
- Input: two co-registered rasters, same shape `(bands, H, W)`, bands =
  Sentinel-2 R/G/B/NIR by default (`in_channels=4`, configurable).
- Output: per-pixel change logits → sigmoid → probability map in [0,1].

## Preprocessing required before this model sees data
Reprojection to common CRS, resolution harmonization, co-registration
(phase correlation), valid-pixel masking — all handled by
`apps/api/services/alignment.py`. This model must never receive raw,
unaligned image pairs.

## Known limitations
- Untrained: no accuracy, F1, or IoU figures exist yet. Do not quote any.
- Binary change only — change-type classification (Phase 4) is a
  separate, not-yet-implemented stage.
- No seasonality/false-alarm suppression yet — a cloud edge or seasonal
  vegetation shift will currently register as "change" like anything
  else. This is exactly why `docs/models/MODEL_CARD.md` and the
  false-alarm engine (spec §16) come before any demo claim of accuracy.
- Trained only on OSCD's city set — expect out-of-distribution behavior
  on very different terrain/sensor combinations without fine-tuning.

## Evaluation (required before demo use)
Run `ml/training/train_fc_siam_diff.py`, then a held-out OSCD IoU/F1
evaluation script (not yet written) before any number from this model
appears in `EVALUATION_REPORT.md` or a demo slide.
