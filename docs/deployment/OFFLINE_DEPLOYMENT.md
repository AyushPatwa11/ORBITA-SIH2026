# Offline / Air-Gapped Deployment

The PS requires network access disabled after staging, for the entire
evaluation (§2.2.6, §2.2.7). This is a hard requirement, not a nice-to-have.

## What "staged" means for this repo
Before disabling network access:
1. All AOIs to be demonstrated must already have their scenes ingested and
   downloaded (`ingestion_state = INDEXED`) — assets are cached to
   `RAW_DIR` on disk and are not re-fetched once local.
2. `docker compose` images must be built (they pull from PyPI/apt at build
   time only, not at run time).
3. Frontend `npm install` must be run beforehand — Vite/React are bundled at
   build time, and `maplibre-gl`'s CSS/JS ship in the app bundle (no CDN
   reference remains — see the loophole fix in `apps/web/src/main.tsx`).
4. If FC-Siam-Diff has been trained, weights must be present under
   `ml/inference/weights/` before disabling network — nothing downloads
   weights at runtime today (there is no pretrained-weights URL to begin
   with; see `docs/models/MODEL_CARD.md`).

## Set `OFFLINE_MODE=true` before the demo
This flag, read from `.env`, currently:
- Disables `copernicus_client.search_catalog` (raises rather than calling out)
- Disables `download.download_and_qc_scene`'s network fetch — it instead
  requires the asset already exist at the expected path in `RAW_DIR`
- Switches the frontend basemap from the CartoDB CDN style to a fully local,
  no-external-source MapLibre style

## Known gap
There is currently no local *vector* basemap (place names, borders, roads)
for the offline style — the offline map shows AOI polygons and change-event
markers on a flat background with no reference geography. If judges need
recognizable geographic context while offline, the honest options are: (a)
accept flat-background AOI/event markers as sufficient (the analytical
content — polygons, change locations — is what matters, not scenery), or
(b) stage a small local vector tileset (e.g. a clipped OSM extract for the
demo AOI) — not done, flagged here rather than silently deferred.

## Verification checklist (run before any offline demo)
- [ ] `docker compose up` with a firewall rule blocking outbound traffic
      active, confirm the app still functions for the staged AOIs
- [ ] Confirm `/health` returns `offline_mode: true`
- [ ] Confirm the frontend badge shows "OFFLINE MODE" and the browser
      devtools Network tab shows no external requests
