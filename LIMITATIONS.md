# Limitations

Mapped against the official PS capabilities (§2.2.1–§2.2.7). Read this
before any demo or submission claim.

## §2.2.1 Semantic and Multimodal Retrieval — IMPLEMENTED (weights not staged)
Text-to-image and image-to-image retrieval now run through a real pipeline:
RemoteCLIP (ViT-B-32 architecture via `open_clip`, chosen and documented in
`docs/models/MODEL_SELECTION.md`) embeds scene previews and text queries;
a FAISS `IndexFlatIP` does exact cosine search; results are filterable by
AOI. **The actual RemoteCLIP checkpoint is not staged in this environment**
(no network path to the host) — the code loads it if present and falls
back to a loud random-init warning otherwise, exactly like FC-Siam-Diff's
untrained weights. Every API response includes `weights_loaded` so the UI
(and anyone reading logs) can see which mode produced a given result. Do
not demo random-init embeddings as semantically meaningful — they capture
crude visual similarity (color/texture), not remote-sensing semantics.

## §2.2.2 Multi-Temporal Change Analysis — PARTIAL
Alignment, FC-Siam-Diff inference, persistence-based earliest-evidence
dating, and rule-based seasonality suppression are implemented. **Change-
type classification is not** — every event is `UNCLASSIFIED`, not
construction/clearance/water/road as the PS example queries expect. The
model itself is architecturally complete but untrained (no accuracy figure
exists — see `docs/models/MODEL_CARD.md`).

## §2.2.3 False-Alarm Suppression and Quality Handling — PARTIAL
Quality gate (cloud/nodata/valid-pixel/resolution/CRS) and seasonality
rule-based suppression exist. Cloud/haze/snow/shadow are only handled via
the blunt cloud-coverage percentage from STAC metadata and a nodata ratio —
there is no per-pixel cloud/shadow mask, so a scene that is 20% cloudy in
exactly the AOI of interest could still pass quality gating.

## §2.2.4 Discovery and Clustering — IMPLEMENTED (weights not staged)
"Find Similar Locations" (`POST /scenes/{id}/similar`) reuses the same
RemoteCLIP embedding + FAISS index as retrieval above — same caveat about
the unstaged checkpoint applies. This is nearest-neighbor lookup against
whatever's indexed, not the wider unsupervised clustering the spec
describes (§2.2.4's "grouping" framing implies something more like k-means
or HDBSCAN over the embedding space to surface clusters proactively,
rather than only query-by-example) — that clustering layer isn't built.

## §2.2.5 Analyst Workflow and Provenance — MOSTLY DONE
Review queue (via `/change-events` + evidence panel), CONFIRM/REJECT/
INCONCLUSIVE with notes, and provenance (`source_scenes`, `model_version`,
`supporting_observations`) are implemented. Feedback is stored but **not
yet used for reranking** — there is no ranking to feed, since retrieval
doesn't exist. Export to JSON/PDF is not implemented.

## §2.2.6 Scale, Incremental Ingestion, Sovereignty — MOSTLY DONE
Incremental ingestion (dedup on `product_id`, no full rebuild) works.
`OFFLINE_MODE` disables external calls and the frontend's basemap
dependency. No vector index exists yet (nothing to index without retrieval).
GeoTIFF/COG ingestion via rasterio is supported; tiling (fixed-size tile
generation with provenance, spec §8) is not implemented — scenes are used
directly, not chunked into tiles, so very large scenes aren't handled
efficiently yet.

## §2.2.7 Constraints — PARTIALLY VERIFIED
See `docs/deployment/OFFLINE_DEPLOYMENT.md` for what's actually been fixed
(CDN basemap/CSS removed from the always-on path) versus what still needs a
real air-gapped test run. Dataset licenses (OSCD, Sentinel data terms) are
listed in `docs/data/DATASET_INVENTORY.md` as **not yet formally verified**.
The RemoteCLIP checkpoint's release license is also not yet verified —
tracked in `docs/models/MODEL_SELECTION.md`.

## Synthetic demo data — what it is and isn't
`POST /demo/seed` writes real, valid GeoTIFFs with fabricated pixel content
(shared persistent terrain + a fading "construction-like" patch) so the
whole pipeline is runnable without live Copernicus credentials. Everything
downstream — quality gate, alignment, inference, embedding, indexing,
preview rendering — is real code running for real. Only the pixel content
is fake, and it's labeled as such everywhere (AOI name, DEMO_GUIDE.md).
Do not present a demo-seeded result as if it came from real satellite data.

## Engineering shortcuts taken for hackathon speed (documented, not hidden)
- `Base.metadata.create_all` instead of Alembic migrations
- Change detection runs synchronously in the request path, not via the
  Redis-backed worker the architecture note describes — fine for a demo AOI,
  will not scale to a large ingestion backlog
- No authentication/RBAC on the API yet (spec §47 requires it eventually)
- No automated test suite yet (spec §50 requires it eventually)
