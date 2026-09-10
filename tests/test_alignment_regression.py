import os
import tempfile
import unittest

import numpy as np
import rasterio
from rasterio.transform import from_origin

from apps.api.services.alignment import align_pair


class AlignmentMemOpenRegressionTest(unittest.TestCase):
    def test_align_pair_runs_without_rasterio_mem_open_security_error(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            before_path = os.path.join(tmpdir, "before.tif")
            after_path = os.path.join(tmpdir, "after.tif")

            transform = from_origin(0.0, 16.0, 1.0, 1.0)
            arr = np.arange(256, dtype=np.float32).reshape(16, 16)
            # Build two bands with identical, simple content so alignment should complete.
            before = np.ones((16, 16), dtype=np.float32) * 10.0
            before[::2, ::2] = 20.0
            after = before.copy()

            with rasterio.open(
                before_path,
                "w",
                driver="GTiff",
                height=16,
                width=16,
                count=1,
                dtype="float32",
                crs="EPSG:4326",
                transform=transform,
            ) as dst:
                dst.write(before.astype(np.float32), 1)

            with rasterio.open(
                after_path,
                "w",
                driver="GTiff",
                height=16,
                width=16,
                count=1,
                dtype="float32",
                crs="EPSG:4326",
                transform=transform,
            ) as dst:
                dst.write(after.astype(np.float32), 1)

            aligned = align_pair(before_path, after_path)
            self.assertIsNotNone(aligned)
            self.assertIn("before", aligned.__dict__)


if __name__ == "__main__":
    unittest.main()
