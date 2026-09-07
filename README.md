# ORBITA — Semantic Earth Observation & Change Intelligence
**Prototype / Demonstration System** · SIH26227 · Team PHOTONS

## What's actually implemented (Phase 1 of the plan)
- AOI registration (PostGIS polygon)
- Copernicus Data Space OAuth2 client-credentials auth, **token cached and
  refreshed only on expiry** — never re-requested per call
- STAC Catalog API search scoped to an AOI's bbox/date range/cloud threshold
- Incremental ingestion: dedups on `product_id`, never rebuilds the index
- Image quality gate (`services/quality.py`): cloud coverage, nodata ratio,
  valid-pixel ratio, resolution and CRS checks → `quality_score` (0–1) and
  GOOD/DEGRADED/UNUSABLE status with explicit reasons

## Phase 2/3 — also implemented
- Scene download + checksum (`services/download.py`), feeding the quality gate
- Alignment pipeline (`services/alignment.py`): reprojection, resolution
  harmonization, phase-correlation co-registration, valid-pixel mask,
  `alignment_quality` — pairs below threshold are rejected, not silently used
- FC-Siam-Diff architecture (`ml/models/fc_siam_diff.py`) + OSCD training
  script (`ml/training/train_fc_siam_diff.py`) — **not trained**, see
  `docs/models/MODEL_CARD.md` before quoting any accuracy number
- Change-event pipeline + review endpoints (confirm/reject/inconclusive)

## Phase 4 — also implemented
- `services/temporal.py`: builds a multi-observation timeline for a change
  event (not just before/after), applies a persistence rule to promote
  POSSIBLE → CONFIRMED and derive `earliest_supported_date` — never phrased
  as a construction date, only "earliest supported observation"
- Rule-based seasonality detector: flags a change signal as
  `LIKELY_FALSE_CHANGE` if it recurs in the same calendar months across
  ≥2 years rather than persisting — interpretable logic per spec, not ML
- `evidence_category` on every change event: LIKELY_TRUE_CHANGE /
  POSSIBLE_CHANGE / LIKELY_FALSE_CHANGE / INSUFFICIENT_EVIDENCE
- `POST /change-events/{id}/analyze-timeline`, `GET /change-events/{id}/timeline`

## Semantic retrieval & similar-site discovery — implemented, weights not staged
- `ml/models/remote_clip.py`: real `open_clip` ViT-B-32 architecture,
  loads a real RemoteCLIP checkpoint if staged at
  `REMOTE_CLIP_WEIGHTS_PATH`, else falls back to a **loud random-init
  warning** — same honesty pattern as FC-Siam-Diff. See
  `docs/models/MODEL_SELECTION.md` for why RemoteCLIP was chosen.
- `services/vector_index.py`: FAISS `IndexFlatIP`, incremental (no full
  rebuild), JSON sidecar for scene-id metadata
- `POST /scenes/{id}/index`, `POST /search/semantic`,
  `POST /scenes/{id}/similar` — every response includes `weights_loaded`
  so callers can see whether results came from trained or random weights
- `POST /demo/seed`: generates synthetic-but-real GeoTIFFs (shared
  persistent terrain + a fading construction-like patch across 6 dates,
  one deliberately cloud-heavy) so the entire pipeline — ingestion→
  quality→alignment→detection→temporal→embedding→search — is runnable
  with zero live credentials. Pixel content is fake; every code path
  touching it is real. Not real satellite imagery — labeled everywhere.
- `GET /scenes/{id}/preview.png`: real RGB rendering from whatever raster
  sits at `local_path` (percentile-stretched, downsampled) — used for
  before/after swipe comparison and similar-site thumbnails in the UI
- `POST /search/change-events`: structured/metadata search (keyword +
  evidence category + confidence + date range) — the explicit fallback
  path the spec allows, kept alongside real semantic search, not instead
  of it

## Frontend
Vite + React + TypeScript. Landing page (offline-safe Three.js globe
hero, capability grid mapped section-by-section to the actual PS clauses
with honest built/partial/planned labels, one-click "seed demo data"),
Overview (`/console`), Investigation (`/investigate` — before/after image
swipe using real preview renders, temporal timeline, similar-sites grid,
analyst review), Search (`/search` — semantic + structured modes). Dark,
restrained analyst-console styling; CDN dependencies removed (CSS bundled,
basemap swaps to a fully local style whenever `OFFLINE_MODE=true`).

## Not yet implemented (do not claim these in a demo)
- Trained change-detection weights / any accuracy figure
- Change-type classification (currently all events are `UNCLASSIFIED`)
- Semantic/embedding retrieval — model choice is *not yet verified*; see
  `docs/models/MODEL_SELECTION.md`
- Similar-site discovery, AOI monitoring scheduler, frontend, exports, evaluation lab

## Setup
```bash
cp .env.example .env
# fill in COPERNICUS_CLIENT_ID / COPERNICUS_CLIENT_SECRET
# (rotate any credential that was ever pasted into chat/logs first)
docker compose up --build          # API + Postgres/PostGIS + Redis

cd apps/web
npm install
npm run dev                        # http://localhost:5173, proxies /api -> :8000
```
API docs: http://localhost:8000/docs

## Frontend — what's implemented
- **Landing** (`/`): offline-safe 3D globe hero (Three.js, no external
  textures), capability grid mapped to PS clauses with honest status
  labels, one-click synthetic demo seeding
- **Overview** (`/console`): draw an AOI (two map clicks for a bbox),
  register it, trigger incremental ingestion, download + quality-check
  individual scenes
- **Investigation** (`/investigate`, hero screen): pick two INDEXED
  scenes, run change detection, browse resulting change events on a dark
  MapLibre map, open the evidence panel (confidence, quality, evidence
  category, earliest supported observation, provenance), real before/
  after image swipe comparison, run/view the temporal timeline, "Find
  Similar Locations" (RemoteCLIP + FAISS), record a CONFIRM / REJECT /
  INCONCLUSIVE analyst decision
- **Search** (`/search`): semantic mode (RemoteCLIP + FAISS text-to-image,
  honestly flags whether trained or random-init weights produced a given
  result) and structured mode (keyword + metadata filters)
- Dark, restrained analyst-console styling per spec §35 — no gauges,
  no gamified dashboard, map-first layout

Not implemented in the UI yet: change-type classification display (every
event shows `UNCLASSIFIED`), monitoring screen, evaluation lab, exports,
per-pixel change-mask overlay on the map (the swipe comparison shows real
before/after imagery; it doesn't yet overlay the model's probability map
on top).


## Design choices made for hackathon speed (documented, not hidden)
- `Base.metadata.create_all` on startup instead of Alembic migrations —
  fine for a demo/prototype; swap to Alembic before anything resembling
  production use.
- FAISS index is real and wired in (`services/vector_index.py`), but the
  RemoteCLIP checkpoint isn't staged in this environment — see
  `docs/models/MODEL_SELECTION.md`.

## Submission documentation
`docs/architecture/ARCHITECTURE.md` · `docs/data/DATASET_INVENTORY.md` ·
`docs/api/API_INTEGRATION_STATUS.md` · `docs/models/MODEL_CARD.md` ·
`docs/models/MODEL_SELECTION.md` · `docs/deployment/OFFLINE_DEPLOYMENT.md` ·
`docs/evaluation/EVALUATION_REPORT.md` (template — no numbers yet) ·
`LIMITATIONS.md` (read this first) · `DEMO_GUIDE.md` · `SECURITY.md`

## Security note
Copernicus credentials are read from environment only. They are never
logged, returned in API responses, or referenced from frontend code.
