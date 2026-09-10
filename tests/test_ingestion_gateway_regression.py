import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from apps.api.routers.scenes import trigger_ingestion


@pytest.mark.asyncio
async def test_trigger_ingestion_failed_job_should_not_report_502(monkeypatch):
    aoi_id = uuid.uuid4()

    db = SimpleNamespace()
    db.get = AsyncMock(return_value=SimpleNamespace(id=aoi_id))

    failed_job = SimpleNamespace(status="FAILED", error="catalog token expired")

    async def fake_run_ingestion_for_aoi(db_arg, aoi_arg):
        return failed_job

    monkeypatch.setattr("apps.api.routers.scenes.run_ingestion_for_aoi", fake_run_ingestion_for_aoi)

    with pytest.raises(HTTPException) as exc:
        await trigger_ingestion(aoi_id, db)

    assert exc.value.status_code == 500
