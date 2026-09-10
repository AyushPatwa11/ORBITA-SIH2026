from datetime import datetime, timedelta
import io
import httpx
import numpy as np
from PIL import Image

def test_temporal_fetch():
    lat, lng = 27.5380, 71.9150
    delta = 0.015
    bbox = f"{lng - delta},{lat - delta},{lng + delta},{lat + delta}"

    # 1. Test 5 years (2018 vs 2024)
    url_2018 = f"https://tiles.maps.eox.at/wms?service=wms&request=getmap&version=1.1.1&layers=s2cloudless-2018&styles=&format=image/jpeg&srs=epsg:4326&bbox={bbox}&width=512&height=512"
    url_current = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox={bbox}&bboxSR=4326&imageSR=4326&size=512,512&format=png&f=image"
    
    r1 = httpx.get(url_2018)
    r2 = httpx.get(url_current)
    print(f"5-Year: 2018 len={len(r1.content)}, current len={len(r2.content)}")

    # 2. Test 1 year (2021 vs 2022 vs current)
    url_2021 = f"https://tiles.maps.eox.at/wms?service=wms&request=getmap&version=1.1.1&layers=s2cloudless-2021&styles=&format=image/jpeg&srs=epsg:4326&bbox={bbox}&width=512&height=512"
    url_2022 = f"https://tiles.maps.eox.at/wms?service=wms&request=getmap&version=1.1.1&layers=s2cloudless-2022&styles=&format=image/jpeg&srs=epsg:4326&bbox={bbox}&width=512&height=512"
    r3 = httpx.get(url_2021)
    r4 = httpx.get(url_2022)
    print(f"1-Year: 2021 len={len(r3.content)}, 2022 len={len(r4.content)}")

if __name__ == "__main__":
    test_temporal_fetch()
