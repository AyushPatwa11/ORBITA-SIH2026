# Architecture Note — ORBITA

## System diagram
```
React+TS (MapLibre, local tiles only in OFFLINE_MODE)
        │  REST/JSON
        ▼
FastAPI ── PostgreSQL+PostGIS (AOIs, scenes, tiles, quality, change events/observations)
   │   └── Redis (reserved for background job queue — synchronous today, see LIMITATIONS.md)
   │
   ├─ Copernicus Data Space Ecosystem (OAuth2 client-credentials, token cached)
   │     Catalog API (STAC search) → Process/asset download
   │
   └─ ML services (in-process, not a separate microservice — hackathon scope)
         quality gate (rasterio) → alignment (rasterio+skimage co-registration)
         → FC-Siam-Diff (PyTorch) → temporal persistence + seasonality rules
```

## Data flow (one AOI, end to end)
1. Analyst draws an AOI (bbox) → `POST /aois`
2. `POST /aois/{id}/ingest` → STAC catalog search scoped to bbox/date/cloud →
   new `Scene` rows only (dedup on `product_id` — no full rebuild)
3. `POST /scenes/{id}/download` → asset fetched, checksummed, quality-gated
   → `ingestion_state` becomes `INDEXED` or `REJECTED_LOW_QUALITY`
4. `POST /change-events/detect` (two INDEXED scenes) → alignment → FC-Siam-Diff
   → connected-component change objects → `ChangeEvent` rows (`NEW`)
5. `POST /change-events/{id}/analyze-timeline` → every other INDEXED scene in
   the AOI is aligned against the same baseline, probability inside the
   event geometry is measured, persistence rule promotes POSSIBLE→CONFIRMED,
   seasonality rule flags recurring-month patterns as false alarms →
   `evidence_category` + `earliest_supported_date`
6. `POST /change-events/{id}/analyze-timeline` → every other INDEXED scene in
   the AOI is aligned against the same baseline, probability inside the
   event geometry is measured, persistence rule promotes POSSIBLE→CONFIRMED,
   seasonality rule flags recurring-month patterns as false alarms →
   `evidence_category` + `earliest_supported_date`
7. `POST /change-events/{id}/review` → analyst CONFIRM/REJECT/INCONCLUSIVE,
   stored with a note — this is the audit trail (§2.2.5)
8. `POST /scenes/{id}/index` → RemoteCLIP embeds the scene's rendered
   preview, FAISS index appends it (no rebuild) → `POST /search/semantic`
   (text query) and `POST /scenes/{id}/similar` (image query) both search
   the same index

## Component list
`apps/api/{main,models,schemas}.py`, `apps/api/core/{config,db}.py`,
`apps/api/routers/{aois,scenes,change_events,demo,search}.py`,
`apps/api/services/{copernicus_client,quality,download,alignment,
change_detection,temporal,preview,demo_seed,embeddings,vector_index}.py`,
`ml/models/{fc_siam_diff,remote_clip}.py`,
`ml/inference/change_inference.py`, `ml/training/train_fc_siam_diff.py`,
`apps/web/src/{pages,components,api}`.

## Index-build / incremental-ingestion procedure
- **Build**: `docker compose up --build` creates schema via
  `Base.metadata.create_all` (see LIMITATIONS.md re: Alembic).
- **Incremental ingestion**: `ingestion.run_ingestion_for_aoi` queries the
  STAC catalog from `AOI.last_processed_at` (or 2023-01-01 on first run) to
  now, and inserts only `product_id`s not already present — no re-query of
  historical date ranges, no index rebuild, matching §2.2.6.
- **Vector index for semantic retrieval**: `services/vector_index.py`
  wraps a FAISS `IndexFlatIP`; `add()` appends a single embedding without
  ever rebuilding the whole index, same incremental principle as scene
  ingestion. Metadata (scene_id) is a JSON sidecar, not inside FAISS.

## Runnable without live credentials
`POST /demo/seed` writes synthetic-but-valid GeoTIFFs (shared terrain +
fading change patch across 6 dates, one deliberately cloud-heavy) so the
complete pipeline — ingestion→quality→alignment→detection→temporal→
embedding→search — can be exercised with zero network access. Every piece
downstream of the pixels is real code; only the pixel content is
fabricated, and it's labeled as such everywhere (AOI name, DEMO_GUIDE.md).

## What is NOT built (see LIMITATIONS.md for the full list)
Change-type classification beyond a single UNCLASSIFIED bucket, monitoring
scheduler, evaluation harness against held-out labels, exports, per-pixel
cloud/shadow masking (only STAC's blunt cloud-cover percentage is used).
The RemoteCLIP checkpoint itself is not staged in this environment — the
code path is real, the trained weights are not present.
