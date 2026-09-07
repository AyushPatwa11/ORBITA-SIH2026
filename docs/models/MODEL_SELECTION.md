# Model Selection

## Change detection: FC-Siam-Diff (chosen)

| Candidate | Compute | Accuracy (lit.) | Offline | Complexity | Decision |
|---|---|---|---|---|---|
| FC-Siam-Diff | Single GPU, minutes/epoch on OSCD-scale patches | Solid, well-documented baseline | Yes — small, no external deps | Low | **Chosen baseline** |
| FC-Siam-Conc | Similar to Diff | Comparable, sometimes worse than Diff per original paper | Yes | Low | Rejected — Diff variant generally reported as stronger |
| ChangeFormer (transformer) | Needs more GPU memory/time to train well | Higher ceiling with enough data | Yes, but heavier | High | Stretch goal only if FC-Siam-Diff baseline lands early and GPU time remains |
| ChangeViT | Similar to ChangeFormer | Newer, less battle-tested for this team's timeline | Yes | High | Rejected for MVP — revisit post-hackathon |

Rationale: single-GPU, hackathon timeline, and "start with a robust
baseline, don't over-engineer" (spec §13) point directly at FC-Siam-Diff.
ChangeFormer/ChangeViT stay documented as the honest upgrade path, not
implemented now.

## Semantic/embedding retrieval: RemoteCLIP (ViT-B/32), selected

**RemoteCLIP** (Liu et al., *"RemoteCLIP: A Vision-Language Foundation Model
for Remote Sensing"*, IEEE TGRS 2024) is a CLIP-architecture model
contrastively fine-tuned on remote-sensing image/caption pairs (RSICD,
RSITMD, UCM-Captions, and a large pseudo-labeled corpus the authors built
from detection/segmentation datasets). It fine-tunes the standard OpenCLIP
`ViT-B-32` / `ViT-B-16` / `ViT-L-14` architectures — no custom model code
needed, `open_clip_torch` loads the architecture, and RemoteCLIP's own
checkpoint replaces the weights.

| Criterion | Assessment |
|---|---|
| License | Code is open (repo license); **released checkpoint license must be verified before any non-research use** — not yet confirmed, tracked below |
| Inference size | ViT-B-32 ≈ 151M params — single-GPU or even CPU inference is fine for query-time embedding |
| Offline availability | Architecture (`open_clip_torch`) has no network dependency once installed; the **fine-tuned checkpoint must be staged locally** (see gap below) |
| Text-image capability | Yes — this is the entire point of the CLIP architecture |
| Remote-sensing suitability | Yes — trained specifically on RS image/caption pairs, unlike generic CLIP which the spec explicitly warns against assuming is adequate |
| Hardware | CPU-feasible for inference; GPU speeds up batch indexing |

Rejected alternative: generic OpenAI CLIP — same architecture, but trained
on natural photos, not remote-sensing imagery; the spec explicitly calls
this out as a bad assumption to make. RemoteCLIP is the same architecture
family with domain-appropriate training data instead.

### Known gap — checkpoint not staged in this environment
This development sandbox has no network path to the checkpoint host
(Hugging Face / the RemoteCLIP repo's release links aren't on the
allowed-domains list here). `ml/models/remote_clip.py` loads the real
`open_clip` `ViT-B-32` architecture and will load real RemoteCLIP weights
from `REMOTE_CLIP_WEIGHTS_PATH` when that file exists; **if it doesn't,
the model falls back to random initialization with a loud warning** —
exactly the same honesty pattern as FC-Siam-Diff's untrained weights.
Embeddings computed on an untrained/random model are not meaningfully
semantic and must not be demoed as if they were. Staging the real
checkpoint (once its license is confirmed) is the single highest-leverage
remaining step for this capability.

### Vector index: FAISS (chosen over Qdrant)
`IndexFlatIP` (cosine similarity via L2-normalized inner product) — exact
search, no approximate-index tuning needed at hackathon scale (hundreds to
low thousands of scenes). Metadata (scene_id, aoi_id, acquisition_time)
lives in a JSON sidecar next to the FAISS index file, not inside FAISS
itself. Qdrant would be the right call if this needed persistent server-
side filtering at much larger scale — not justified yet.

