import logging
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.database import FurnitureCatalog
from app.models.schemas import FurnitureCatalogResponse


class CatalogCreateRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    name: str
    default_width: float
    default_length: float
    typical_room_type: str
    image_path: str | None = None
    source_design_id: str | None = None
    source_prompt: str = ""


class CatalogBulkDeleteRequest(BaseModel):
    item_ids: list[str]


class FurnitureGenerateRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    name: str
    typical_room_type: str = "living_room"
    default_width: float = 1.0
    default_length: float = 1.0
    style: str = "modern"
    sd_model: str = ""

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/models")
async def list_sd_models():
    from app.services.comfy_api import get_available_models
    models = await get_available_models()
    return models


def _to_url(path: str | None) -> str | None:
    if not path:
        return None
    abs_assets = os.path.abspath(settings.assets_path)
    abs_path = os.path.abspath(path)
    if abs_path == abs_assets or abs_path.startswith(abs_assets + os.sep):
        rel = os.path.relpath(path, abs_assets)
        return "/assets/" + rel.replace("\\", "/")
    return path


def _to_response(item: FurnitureCatalog) -> FurnitureCatalogResponse:
    return FurnitureCatalogResponse(
        id=item.id,
        name=item.name,
        default_width=item.default_width,
        default_length=item.default_length,
        typical_room_type=item.typical_room_type,
        image_path=_to_url(item.image_path),
        source_design_id=item.source_design_id,
        source_prompt=item.source_prompt,
        created_at=item.created_at,
    )


@router.post("", response_model=FurnitureCatalogResponse, status_code=201)
async def create_catalog_item(body: CatalogCreateRequest, db: AsyncSession = Depends(get_db)):
    item = FurnitureCatalog(
        name=body.name,
        default_width=body.default_width,
        default_length=body.default_length,
        typical_room_type=body.typical_room_type,
        image_path=body.image_path,
        source_design_id=body.source_design_id,
        source_prompt=body.source_prompt,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _to_response(item)


@router.get("", response_model=list[FurnitureCatalogResponse])
async def list_catalog(
    q: str | None = None,
    room_type: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(FurnitureCatalog).order_by(FurnitureCatalog.created_at.desc())
    if q:
        stmt = stmt.where(FurnitureCatalog.name.ilike(f"%{q}%"))
    if room_type:
        stmt = stmt.where(FurnitureCatalog.typical_room_type == room_type)
    if limit:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return [_to_response(item) for item in result.scalars().all()]


@router.get("/{item_id}", response_model=FurnitureCatalogResponse)
async def get_catalog_item(item_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FurnitureCatalog).where(FurnitureCatalog.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    return _to_response(item)


@router.delete("/{item_id}", status_code=204)
async def delete_catalog_item(item_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FurnitureCatalog).where(FurnitureCatalog.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Catalog item not found")

    if item.image_path and os.path.isfile(item.image_path):
        try:
            os.remove(item.image_path)
        except Exception as e:
            logger.warning("[CATALOG] Failed to delete image file %s: %s", item.image_path, e)

    await db.delete(item)
    await db.commit()
    logger.info("[CATALOG] Deleted item %s (%s)", item_id, item.name)


@router.post("/bulk-delete", status_code=200)
async def bulk_delete_catalog(body: CatalogBulkDeleteRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FurnitureCatalog).where(FurnitureCatalog.id.in_(body.item_ids)))
    items = result.scalars().all()
    if not items:
        raise HTTPException(status_code=404, detail="No matching catalog items found")

    deleted_ids = []
    for item in items:
        if item.image_path and os.path.isfile(item.image_path):
            try:
                os.remove(item.image_path)
            except Exception as e:
                logger.warning("[CATALOG] Failed to delete image file %s: %s", item.image_path, e)
        await db.delete(item)
        deleted_ids.append(item.id)

    await db.commit()
    logger.info("[CATALOG] Bulk deleted %d catalog items: %s", len(deleted_ids), deleted_ids)
    return {"deleted_count": len(deleted_ids), "deleted_ids": deleted_ids}


@router.post("/generate", response_model=FurnitureCatalogResponse, status_code=201)
async def generate_furniture_image(body: FurnitureGenerateRequest, db: AsyncSession = Depends(get_db)):
    room_label = body.typical_room_type.replace("_", " ")
    prompt = (
        f"Single piece of furniture: {body.name} in a {room_label}, {body.style} style. "
        f"Product shot, isolated on white background, centered, "
        f"photorealistic, 3D render, high quality, detailed texture, clean edges"
    )
    negative_prompt = (
        "blurry, low quality, distorted, extra furniture, room background, "
        "people, animals, text, watermark, low resolution, cartoon, sketch"
    )

    logger.info("[CATALOG] Generating furniture image via ComfyUI: %s", body.name)

    try:
        from app.services.comfy_api import generate_txt2img
        images = await generate_txt2img(
            prompt=prompt,
            negative_prompt=negative_prompt,
            width=512,
            height=512,
            steps=min(settings.sd_steps, 25),
            cfg=7.5,
            model=body.sd_model,
        )
    except Exception as e:
        err_msg = str(e)
        if "ConnectError" in err_msg or "connection" in err_msg.lower() or "Connection refused" in err_msg:
            detail = "ComfyUI is not running. Start it with start.cmd or launch ComfyUI/main.py manually."
        else:
            detail = f"Image generation failed: {err_msg}"
        logger.warning("[CATALOG] Generation failed: %s", err_msg)
        raise HTTPException(status_code=502, detail=detail)

    catalog_dir = os.path.join(settings.assets_path, "catalog")
    os.makedirs(catalog_dir, exist_ok=True)
    filename = f"{body.name.replace(' ', '_').lower()}_{uuid.uuid4().hex[:8]}.png"
    filepath = os.path.join(catalog_dir, filename)

    try:
        with open(filepath, "wb") as f:
            f.write(images[0])
    except Exception as e:
        logger.error("[CATALOG] Failed to save generated image: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to save image: {e}")

    item = FurnitureCatalog(
        name=body.name,
        default_width=body.default_width,
        default_length=body.default_length,
        typical_room_type=body.typical_room_type,
        image_path=filepath,
        source_design_id=None,
        source_prompt=f"{body.name} in {room_label}, {body.style} style",
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    logger.info("[CATALOG] Generated and saved furniture: %s -> %s", body.name, filepath)
    return _to_response(item)
