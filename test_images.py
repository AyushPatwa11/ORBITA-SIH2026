"""Test that before/after satellite images are genuinely different."""
import httpx
import hashlib

payload = {
    "name": "Bhadla Solar Park",
    "latitude": 27.538,
    "longitude": 71.915,
    "time_preset": "5_years",
    "change_type_hint": "auto",
    "analysis_radius_km": 1.5,
}

print("Calling pin-and-fetch (5-year span)...")
r = httpx.post("http://localhost:8000/api/location/pin-and-fetch", json=payload, timeout=120)
print(f"Status: {r.status_code}")

if r.status_code == 200:
    data = r.json()
    before_id = data["before_scene"]["id"]
    after_id = data["after_scene"]["id"]
    before_time = data["before_scene"]["acquisition_time"]
    after_time = data["after_scene"]["acquisition_time"]
    print(f"Before scene: {before_id} @ {before_time}")
    print(f"After scene:  {after_id} @ {after_time}")

    b_img = httpx.get(f"http://localhost:8000/api/scenes/{before_id}/preview.png", timeout=30)
    a_img = httpx.get(f"http://localhost:8000/api/scenes/{after_id}/preview.png", timeout=30)

    b_hash = hashlib.md5(b_img.content).hexdigest()
    a_hash = hashlib.md5(a_img.content).hexdigest()

    print(f"\nBefore PNG: {len(b_img.content)} bytes  MD5={b_hash[:12]}")
    print(f"After PNG:  {len(a_img.content)} bytes  MD5={a_hash[:12]}")

    if b_hash == a_hash:
        print("\n❌ SAME images — problem persists!")
    else:
        print("\n✅ DIFFERENT images — before/after are distinct!")

    open("test_before_result.png", "wb").write(b_img.content)
    open("test_after_result.png", "wb").write(a_img.content)
    print("Saved test_before_result.png and test_after_result.png")

    report = data.get("change_report", {})
    if report:
        print(f"\nChange report: {report.get('change_category')}")
        print(f"  Summary: {report.get('change_summary', '')[:120]}")
else:
    print("Error:", r.text[:600])
