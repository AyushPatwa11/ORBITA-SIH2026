import uuid

from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2.shape import to_shape
from shapely.geometry import shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.core.db import get_db
from apps.api.models import AOI
from apps.api.schemas import AOICreate, AOIOut

router = APIRouter(prefix="/aois", tags=["aois"])


def _to_out(aoi: AOI) -> AOIOut:
    geom = to_shape(aoi.geometry) if aoi.geometry is not None else None
    return AOIOut(
        id=aoi.id,
        name=aoi.name,
        max_cloud_cover=aoi.max_cloud_cover,
        monitoring_enabled=aoi.monitoring_enabled,
        created_at=aoi.created_at,
        geometry=geom.__geo_interface__ if geom else None,
    )


@router.post("", response_model=AOIOut)
async def create_aoi(payload: AOICreate, db: AsyncSession = Depends(get_db)):
    geom = shape(payload.geojson_polygon)
    aoi = AOI(
        id=uuid.uuid4(),
        name=payload.name,
        geometry=f"SRID=4326;{geom.wkt}",
        max_cloud_cover=payload.max_cloud_cover,
        monitoring_enabled=payload.monitoring_enabled,
        monitoring_frequency_days=payload.monitoring_frequency_days,
    )
    db.add(aoi)
    await db.commit()
    await db.refresh(aoi)
    return _to_out(aoi)


@router.get("", response_model=list[AOIOut])
async def list_aois(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AOI))
    return [_to_out(a) for a in result.scalars().all()]


@router.get("/{aoi_id}", response_model=AOIOut)
async def get_aoi(aoi_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    aoi = await db.get(AOI, aoi_id)
    if not aoi:
        raise HTTPException(404, "AOI not found")
    return _to_out(aoi)
