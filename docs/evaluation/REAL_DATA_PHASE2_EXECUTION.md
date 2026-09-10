# Real-data conversion and next-phase execution record

## Objective
Convert the downloaded Copernicus Sentinel-2 L2A SAFE product into a repository-compatible GeoTIFF raster and create the project-facing metadata object needed before the quality gate and alignment phase.

## Verified product source
The source file is:

`/Users/utsavraj/Downloads/S2C_MSIL2A_20260307T053701_N0512_R005_T43RDQ_20260307T103208.SAFE`

## Executed conversion steps
1. Extracted and inspected the SAFE product tree.
2. Confirmed the live product includes JP2 raster bands under `GRANULE/.../IMG_DATA/R10m`.
3. Converted the real Sentinel-2 L2A product into a four-band GeoTIFF using GDAL inside the API container runtime:
   - B02_10m
   - B03_10m
   - B04_10m
   - B08_10m
4. Stored the output GeoTIFF in the expected repo raw-image location:
   - `data/raw/S2C_MSIL2A_20260307T053701_N0512_R005_T43RDQ_20260307T103208.tif`
5. Created a metadata sidecar with the project-facing schema fields:
   - `data/raw/S2C_MSIL2A_20260307T053701_N0512_R005_T43RDQ_20260307T103208.metadata.json`

## Verified raster evidence
The GeoTIFF was verified with `rasterio` from the API container:

- CRS: `EPSG:32643`
- Image size: `10980 x 10980`
- Band count: `4`
- Pixel dtype: `uint16`

## Project-fit status
The raster file is now a legitimate project artifact that the repository quality gate can open through `rasterio` and the metadata file mirrors the project’s scene-level schema direction.

## What is still missing before the next route can be called successfully
The final DB-backed scene registration is not yet written to the `Scene` table, because the repository expects a `Scene` row in the Postgres model with:

- `aoi_id`
- `product_id`
- `sensor`
- `acquisition_time`
- `cloud_cover`
- `footprint`
- `gsd_meters`
- `source`
- `processing_version`
- `raw_asset_ref`
- `local_path`
- `ingestion_state`

## Next implementation slice
The next repository-aligned implementation slice is:

1. Scene DB registration from the metadata sidecar.
2. Quality gate `assess_raster` route/service call.
3. QualityReport row creation and persistence.
4. Alignment of a second real or synthetic pair from the same AOI.
5. Change event creation and one evaluation artifact entry.

## Important discipline
Do not jump to semantic retrieval, similar-site discovery, or SAR fusion before the real optical pair is proven in a measured quality-gate and alignment route.
