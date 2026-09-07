# Demo Guide (matches what's actually implemented — see LIMITATIONS.md)

## Fastest path — zero setup
From the Landing page, click **"Try it now — seed demo data"**. This
generates synthetic-but-real GeoTIFFs and drops you into Investigation
with a ready-to-use AOI. Skip to step 4 below. This is not real satellite
imagery — say so if asked; see the synthetic-data note in LIMITATIONS.md.

## Full path — with live Copernicus credentials

## Prerequisites
- `.env` filled in with real Copernicus credentials (rotate any credential
  ever pasted into a chat first), OR `OFFLINE_MODE=true` with scenes
  pre-staged in `RAW_DIR` per `docs/deployment/OFFLINE_DEPLOYMENT.md`.
- `docker compose up --build` running; `cd apps/web && npm run dev` running.

## Script
1. **Overview screen** — draw an AOI (two map clicks for a bbox covering a
   real river/construction area), name it, create it.
2. Click **"Check for new scenes"** — shows scenes found via the Catalog API
   (or pre-staged scenes if offline).
3. Select at least two scenes across different dates, click **"Download +
   quality-check"** on each — watch `ingestion_state` move to `INDEXED` and
   the quality score/status appear.
4. **Investigation screen** — pick the AOI, pick a before/after scene pair,
   click **Detect change**. Explain honestly: the model is untrained, so
   this demonstrates the *pipeline* (alignment → inference → change objects
   → DB persistence), not validated accuracy.
5. Select the resulting change event — the before/after swipe panel shows
   real rendered imagery from the two source scenes. Walk through the
   evidence panel: confidence decomposition, quality score, provenance.
6. Click **Analyze timeline** — show the persistence rule promoting
   POSSIBLE→CONFIRMED across observations, and the resulting
   `evidence_category` and `earliest_supported_date` — always phrased as
   "earliest supported observation," never a construction date.
7. Click **"Find Similar Locations"** — real RemoteCLIP + FAISS search;
   the result cards show `weights_loaded: false` unless a real checkpoint
   has been staged, so be upfront about which mode produced the ranking.
8. Try the **Search** page — semantic mode (same embedding search) and
   structured mode (keyword/metadata filters over change events).
9. Record a CONFIRM/REJECT/INCONCLUSIVE decision with a note — this is the
   audit trail.

## What to say when asked about gaps
Be direct: a trained FC-Siam-Diff checkpoint, a trained/staged RemoteCLIP
checkpoint, change-type classification, and per-pixel cloud masking are
the honest next steps. Point to `LIMITATIONS.md` rather than improvising
an answer.
