import logging
import os
import shutil

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.database import Project

logger = logging.getLogger(__name__)
from app.models.schemas import BulkDeleteRequest, ProjectCreate, ProjectResponse

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).order_by(Project.updated_at.desc()))
    projects = result.scalars().all()
    return [ProjectResponse(
        id=p.id, name=p.name, original_prompt=p.original_prompt,
        created_at=p.created_at, updated_at=p.updated_at,
    ) for p in projects]


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(body: ProjectCreate, db: AsyncSession = Depends(get_db)):
    project = Project(name=body.name, original_prompt=body.original_prompt)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectResponse(
        id=project.id, name=project.name, original_prompt=project.original_prompt,
        created_at=project.created_at, updated_at=project.updated_at,
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse(
        id=project.id, name=project.name, original_prompt=project.original_prompt,
        created_at=project.created_at, updated_at=project.updated_at,
    )


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)
    await db.commit()

    assets_dir = f"{settings.assets_path}/{project_id}"
    if os.path.isdir(assets_dir):
        shutil.rmtree(assets_dir)
        logger.info("[PROJECTS] Deleted assets for project %s", project_id)


@router.post("/bulk-delete", status_code=200)
async def bulk_delete_projects(body: BulkDeleteRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id.in_(body.project_ids)))
    projects = result.scalars().all()
    if not projects:
        raise HTTPException(status_code=404, detail="No matching projects found")

    deleted_ids = []
    for p in projects:
        await db.delete(p)
        deleted_ids.append(p.id)

    await db.commit()

    for pid in deleted_ids:
        assets_dir = f"{settings.assets_path}/{pid}"
        if os.path.isdir(assets_dir):
            try:
                shutil.rmtree(assets_dir)
            except Exception:
                logger.warning("[PROJECTS] Failed to delete assets for %s", pid)

    logger.info("[PROJECTS] Bulk deleted %d projects: %s", len(deleted_ids), deleted_ids)
    return {"deleted_count": len(deleted_ids), "deleted_ids": deleted_ids}
