import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.database import Project, Design
from app.services.intelligence_service import compute_score, compute_sunlight, compute_evolution

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/designs", tags=["intelligence"])


@router.get("/{project_id}/{version}/intelligence")
async def get_intelligence(
    project_id: str,
    version: int,
    lat: float = Query(40.7),
    lon: float = Query(-74.0),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Design).where(Design.project_id == project_id, Design.version == version)
    )
    design = result.scalar_one_or_none()
    if not design:
        raise HTTPException(status_code=404, detail="Design not found")

    definition = json.loads(design.json_definition)
    score = compute_score(definition)
    sunlight = compute_sunlight(definition, lat=lat, lon=lon)

    return {"score": score, "sunlight": sunlight}


@router.get("/{project_id}/{version}/intelligence/report")
async def get_intelligence_report(
    project_id: str,
    version: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Design).where(Design.project_id == project_id, Design.version == version)
    )
    design = result.scalar_one_or_none()
    if not design:
        raise HTTPException(status_code=404, detail="Design not found")

    definition = json.loads(design.json_definition)
    score = compute_score(definition)
    sunlight = compute_sunlight(definition)

    report = {
        "project_id": project_id,
        "version": version,
        "generated_at": None,
        "score": score,
        "sunlight": sunlight,
    }
    return report


@router.get("/{project_id}/evolution")
async def get_evolution(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Design)
        .where(Design.project_id == project_id)
        .order_by(Design.version.asc())
    )
    designs = result.scalars().all()
    if not designs:
        raise HTTPException(status_code=404, detail="No designs found for this project")

    return compute_evolution(designs)
