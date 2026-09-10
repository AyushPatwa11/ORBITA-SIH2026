import json
from pathlib import Path

from apps.api.services.ingestion import parse_metadata_sidecar


def test_parse_metadata_sidecar_maps_expected_scene_fields(tmp_path: Path):
    metadata_path = tmp_path / "S2C_MSIL2A_20260307T053701_N0512_R005_T43RDQ_20260307T103208.metadata.json"
    metadata = {
        "product_id": "S2C_MSIL2A_20260307T053701_N0512_R005_T43RDQ_20260307T103208",
        "sensor": "SENTINEL-2",
        "source": "copernicus_dataspace",
        "processing_version": "v1",
        "acquisition_time": "2026-03-07T05:37:01.025000Z",
        "cloud_cover": 0.0,
        "raw_asset_ref": None,
        "local_path": "/data/raw/S2C_MSIL2A_20260307T053701_N0512_R005_T43RDQ_20260307T103208.tif",
        "gsd_meters": 10.0,
        "crs": "EPSG:32643",
        "ingestion_state": "DISCOVERED",
        "dataset_format": "SAFE->GeoTIFF",
    }
    metadata_path.write_text(json.dumps(metadata))

    parsed = parse_metadata_sidecar(str(metadata_path))

    assert parsed["product_id"] == metadata["product_id"]
    assert parsed["sensor"] == metadata["sensor"]
    assert parsed["source"] == metadata["source"]
    assert parsed["processing_version"] == metadata["processing_version"]
    assert parsed["local_path"].endswith(".tif")
    assert parsed["ingestion_state"] == metadata["ingestion_state"]
