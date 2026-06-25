import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.database import Project, Design
from app.models.schemas import DesignResponse, DesignUpdate, DesignDefinition
from app.solver.layout import solve_layout, validate_layout, auto_generate_hallway, LayoutError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects/{project_id}/designs", tags=["designs"])


@router.get("", response_model=list[DesignResponse])
async def list_designs(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Design).where(Design.project_id == project_id).order_by(Design.version.desc())
    )
    designs = result.scalars().all()
    return [_design_to_response(d) for d in designs]


@router.get("/{version}", response_model=DesignResponse)
async def get_design(project_id: str, version: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Design).where(Design.project_id == project_id, Design.version == version)
    )
    design = result.scalar_one_or_none()
    if not design:
        raise HTTPException(status_code=404, detail="Design not found")
    return _design_to_response(design)


@router.put("/{version}", response_model=DesignResponse)
async def update_design(
    project_id: str, version: int, body: DesignUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Design).where(Design.project_id == project_id, Design.version == version)
    )
    design = result.scalar_one_or_none()
    if not design:
        raise HTTPException(status_code=404, detail="Design not found")
    design.json_definition = body.json_definition.model_dump_json()
    await db.commit()
    await db.refresh(design)
    return _design_to_response(design)


@router.post("/{version}/resolve", response_model=DesignResponse)
async def resolve_design(
    project_id: str, version: int, body: DesignUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Design).where(Design.project_id == project_id, Design.version == version)
    )
    design = result.scalar_one_or_none()
    if not design:
        raise HTTPException(status_code=404, detail="Design not found")

    definition = body.json_definition

    hallways_rooms = len(definition.rooms)
    definition = auto_generate_hallway(definition)
    if len(definition.rooms) > hallways_rooms:
        logger.info("[DESIGNS] Added hallway during resolve")

    try:
        definition = solve_layout(definition)
    except LayoutError as e:
        raise HTTPException(status_code=400, detail=str(e))

    is_valid, errors = validate_layout(definition)
    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail=f"Layout validation failed: {'; '.join(errors[:5])}"
        )

    design.json_definition = definition.model_dump_json()
    await db.commit()
    await db.refresh(design)
    logger.info("[DESIGNS] Resolved design %s v%d (%d rooms)", project_id, version, len(definition.rooms))
    return _design_to_response(design)


def _design_to_response(d: Design) -> DesignResponse:
    return DesignResponse(
        id=d.id,
        project_id=d.project_id,
        version=d.version,
        json_definition=json.loads(d.json_definition),
        rendering_image_path=d.rendering_image_path,
        floor_plan_image_path=d.floor_plan_image_path,
        created_at=d.created_at,
    )
