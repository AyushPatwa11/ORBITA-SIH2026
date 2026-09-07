# Security Posture

## Secrets
Copernicus credentials are read from environment variables only
(`apps/api/core/config.py`), never hardcoded, never logged, never returned
in an API response, never referenced from frontend code. `.env` is
gitignored; `.env.example` ships with blank values.

**Action item**: any credential that is ever pasted into a chat, ticket, or
log should be treated as compromised and rotated — this happened once
during development and was flagged at the time; confirm it was rotated
before using this repo further.

## Current gaps (not yet built — do not claim otherwise)
- No authentication or role-based access control on any API endpoint.
- No rate limiting.
- No input validation beyond Pydantic's type coercion — a malformed
  GeoJSON polygon will raise a 500, not a clean 400, in some paths.
- No audit log beyond the `analyst_note`/`analyst_status` fields on
  `ChangeEvent` — no tamper-evident or append-only log yet (spec §48).
- File downloads write to a fixed path derived from `product_id`; this
  hasn't been reviewed for path-traversal safety if `product_id` is ever
  attacker-influenced (currently it always comes from Copernicus's own
  catalog response, not user input, which limits but doesn't eliminate risk).

## Treat all external input as untrusted
STAC catalog responses and uploaded imagery are external data. Nothing in
this repo currently parses natural-language queries into SQL or shell
commands (no semantic search exists yet), so there is no prompt-injection-
style attack surface today — but this must be re-reviewed the moment
semantic query parsing is implemented (§9/§47 of the original brief).
