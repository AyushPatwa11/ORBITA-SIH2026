"""
Copernicus Data Space Ecosystem client.

- OAuth2 client-credentials flow, token cached in-process and refreshed
  only when expired (never re-requested per call).
- Catalog search against the STAC API for Sentinel-2 L2A scenes.

Credentials are read from environment only (see core/config.py). Never
hardcode them here and never expose this module to the frontend.
"""

import time

import httpx

from apps.api.core.config import settings


class CopernicusAuthError(RuntimeError):
    pass


class TokenCache:
    def __init__(self):
        self._token: str | None = None
        self._expires_at: float = 0.0

    def valid(self) -> bool:
        # 60s safety margin before actual expiry
        return self._token is not None and time.time() < (self._expires_at - 60)

    def set(self, token: str, expires_in: int):
        self._token = token
        self._expires_at = time.time() + expires_in

    @property
    def token(self) -> str | None:
        return self._token


_token_cache = TokenCache()


async def get_access_token() -> str:
    if _token_cache.valid():
        return _token_cache.token  # type: ignore[return-value]

    if not settings.copernicus_client_id or not settings.copernicus_client_secret:
        raise CopernicusAuthError(
            "COPERNICUS_CLIENT_ID / COPERNICUS_CLIENT_SECRET not set in environment."
        )

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            settings.copernicus_token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.copernicus_client_id,
                "client_secret": settings.copernicus_client_secret,
            },
        )
    if resp.status_code != 200:
        raise CopernicusAuthError(f"Token request failed: {resp.status_code} {resp.text}")

    payload = resp.json()
    _token_cache.set(payload["access_token"], payload.get("expires_in", 600))
    return _token_cache.token  # type: ignore[return-value]


async def search_catalog(
    bbox: list[float],
    date_from: str,
    date_to: str,
    max_cloud_cover: float = 20.0,
    collection: str = "SENTINEL-2",
    limit: int = 50,
) -> list[dict]:
    """
    Query the STAC Catalog API for scenes intersecting bbox within a date
    range and below a cloud-cover threshold. Returns raw STAC items;
    the ingestion service is responsible for turning these into Scene rows.
    """
    if settings.offline_mode:
        raise RuntimeError("OFFLINE_MODE is enabled — catalog search is disabled.")

    token = await get_access_token()
    body = {
        "collections": [collection],
        "bbox": bbox,
        "datetime": f"{date_from}/{date_to}",
        "limit": limit,
        "query": {"eo:cloud_cover": {"lt": max_cloud_cover}},
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{settings.copernicus_catalog_url}/search",
            json=body,
            headers={"Authorization": f"Bearer {token}"},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Catalog search failed: {resp.status_code} {resp.text}")

    return resp.json().get("features", [])
