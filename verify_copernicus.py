import asyncio
from apps.api.services.copernicus_client import get_access_token, search_catalog

async def main():
    print("Connecting to Copernicus Data Space Ecosystem (CDSE)...")
    token = await get_access_token()
    print(" Authentication: SUCCESS! Token acquired (length: " + str(len(token)) + ")")
    
    # Search for Sentinel-2 L2A passes over Bhadla Solar Park
    print("\nQuerying European Space Agency STAC Catalog for Bhadla Solar Park...")
    passes = await search_catalog(
        bbox=[71.8, 27.4, 72.0, 27.6],
        date_from="2024-01-01T00:00:00Z",
        date_to="2024-04-01T00:00:00Z",
        max_cloud_cover=15.0,
    )
    print(f" Found {len(passes)} real Sentinel-2 satellite passes!\n")
    for p in passes[:5]:
        dt = p["properties"].get("datetime", "")[:10]
        clouds = p["properties"].get("eo:cloud_cover", 0.0)
        pid = p["id"]
        print(f"   [Sentinel-2 Pass] {pid[:35]}... | Date: {dt} | Cloud Cover: {clouds:.1f}%")

if __name__ == "__main__":
    asyncio.run(main())
