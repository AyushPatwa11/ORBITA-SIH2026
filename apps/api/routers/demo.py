from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.core.db import get_db
from apps.api.schemas import DemoSeedOut
from apps.api.services.demo_seed import seed_demo_data

router = APIRouter(tags=["demo"])


@router.post("/demo/seed", response_model=DemoSeedOut)
async def seed_demo(db: AsyncSession = Depends(get_db)):
    """
    Creates a synthetic AOI + 6 synthetic scenes (one deliberately
    cloud-heavy) so the whole pipeline — quality gate, alignment, change
    detection, temporal analysis, preview rendering — can be exercised
    without live Copernicus credentials or network access. Pixel content
    is fabricated; every code path that touches it is real.
    """
    return await seed_demo_data(db)
