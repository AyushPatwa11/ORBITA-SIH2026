"""Quick test to verify Sentinel Hub Process API returns distinct before/after images."""
import httpx
import os
from PIL import Image
import io

CLIENT_ID = "sh-830c542c-f362-4df1-a6ab-aedc000fde25"
CLIENT_SECRET = "2rxfVZgz5ZksICGIfR2aaD50nc3VMypH"
TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"

EVALSCRIPT = """
//VERSION=3
function setup() {
  return { input: ["B04","B03","B02"], output: { bands: 3 } };
}
function evaluatePixel(s) {
  return [2.5*s.B04, 2.5*s.B03, 2.5*s.B02];
}
"""

def get_token():
    r = httpx.post(TOKEN_URL, data={
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]

def fetch_image(token, bbox, date_from, date_to, label):
    payload = {
        "input": {
            "bounds": {
                "bbox": bbox,
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
            },
            "data": [{
                "type": "sentinel-2-l2a",
                "dataFilter": {
                    "timeRange": {"from": f"{date_from}T00:00:00Z", "to": f"{date_to}T23:59:59Z"},
                    "maxCloudCoverage": 40,
                    "mosaickingOrder": "leastCC",
                },
            }],
        },
        "output": {
            "width": 256, "height": 256,
            "responses": [{"identifier": "default", "format": {"type": "image/png"}}],
        },
        "evalscript": EVALSCRIPT,
    }
    r = httpx.post(PROCESS_URL, json=payload,
                   headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                   timeout=45)
    if r.status_code == 200 and len(r.content) > 5000:
        img = Image.open(io.BytesIO(r.content)).convert("RGB")
        img.save(f"test_{label}.png")
        print(f"  ✅ {label}: {r.status_code}, {len(r.content)} bytes → saved test_{label}.png")
        return True
    else:
        print(f"  ❌ {label}: {r.status_code} — {r.text[:300]}")
        return False

if __name__ == "__main__":
    print("Getting token...")
    token = get_token()
    print(f"  Token acquired: {token[:30]}...")

    # Bhadla Solar Park
    bbox = [71.88, 27.51, 71.95, 27.57]

    print("\nFetching BEFORE image (2021 — pre-expansion)...")
    fetch_image(token, bbox, "2021-01-01", "2021-04-30", "before_2021")

    print("\nFetching AFTER image (2024 — full build-out)...")
    fetch_image(token, bbox, "2024-01-01", "2024-04-30", "after_2024")

    print("\nDone! Compare test_before_2021.png and test_after_2024.png")
