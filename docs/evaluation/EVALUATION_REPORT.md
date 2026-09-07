# Evaluation Report (template — no numbers filled in yet)

The PS requires a reproducible report stating: indexed area, number of
scenes/tiles, build time, storage footprint, query latency, and hardware
used. It also states retrieval will be scored against **held-out** semantic
queries and relevance judgements, and change analysis against a **held-out**
labelled change/no-change set the team has not seen (§2.3). Nothing below is
measured yet — do not present any of these as real numbers until they are.

## Hardware used
- CPU: _fill in_
- GPU: single GPU confirmed available (per team) — model/VRAM: _fill in_
- RAM / disk: _fill in_

## Ingestion / indexing
| Metric | Value |
|---|---|
| Indexed AOI area (km²) | not measured |
| Scenes ingested | not measured |
| Tiles generated | not measured (tiling not yet implemented — see LIMITATIONS.md) |
| Index build time | not measured |
| Storage footprint | not measured |
| Incremental ingestion time (per new scene) | not measured |

## Semantic retrieval (blocked)
Not measurable — semantic/embedding retrieval is not implemented
(`docs/models/MODEL_SELECTION.md`). Precision@K, Recall@K, nDCG@K, and query
latency cannot be reported until it is.

## Change detection
| Metric | Value |
|---|---|
| IoU | not measured — FC-Siam-Diff is untrained (`docs/models/MODEL_CARD.md`) |
| F1 / precision / recall | not measured |
| False positive rate | not measured |

## Change classification
Not applicable — all detected changes are currently `UNCLASSIFIED`; no
change-type classifier exists yet.

## Temporal
| Metric | Value |
|---|---|
| Earliest-supported-date error | not measured — no held-out ground truth available yet |

## Held-out evaluation readiness
When the organiser's held-out query/label set arrives, the harness needed
to score against it (precision@K computation, IoU scoring against ground-
truth masks) does not exist yet — this is the single biggest open risk
against the PS's stated evaluation method and should be built well before
any held-out set is provided, not after.
