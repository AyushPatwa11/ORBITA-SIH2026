# API Integration Status

| Provider | API | Purpose | Auth | Environment | Status | Tested Date | Known Limits | Fallback | Offline Strategy |
|---|---|---|---|---|---|---|---|---|---|
| Copernicus Data Space Ecosystem | STAC Catalog API | Scene discovery | OAuth2 client-credentials, token cached | dev | **Implemented, not yet live-tested against real credentials** | — | Free-tier request quotas apply, not yet measured | None | `OFFLINE_MODE=true` disables catalog calls entirely; requires imagery pre-staged in `RAW_DIR` |
| Copernicus Data Space Ecosystem | Asset download (STAC href) | Raw scene download | Same token | dev | Implemented, not yet live-tested | Same as above | None | Same as above |
| CartoDB basemap tiles | Raster tile XYZ | Frontend basemap | None (public) | dev | Implemented — **external dependency, disabled automatically when `OFFLINE_MODE=true`** (falls back to a local flat-background style, see MapView.tsx) | — | N/A | Local offline style | Automatic via `/health` → `offline_mode` |

Do not mark any row "Complete" until it has been exercised against real
Copernicus credentials and a Tested Date is filled in — this table is
currently honest about being untested, not integrated-and-verified.
