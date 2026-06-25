import base64
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.models.database import Model
from app.models.schemas import ImportImageResponse
from app.services.llm_service import call_llm_vision

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/import", tags=["import"])

MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_TYPES = {"image/png", "image/jpeg", "image/webp"}


@router.post("/image", response_model=ImportImageResponse)
async def import_from_image(
    file: UploadFile = File(...),
    prompt: str = Form(""),
    llm_id: str = Form(alias="model_id"),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. "
                   f"Allowed: PNG, JPEG, WEBP",
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({len(contents)} bytes). Max: 10 MB",
        )

    image_base64 = base64.b64encode(contents).decode("utf-8")

    result = await db.execute(select(Model).where(Model.id == llm_id))
    model_obj = result.scalar_one_or_none()
    if not model_obj:
        raise HTTPException(status_code=404, detail="Model not found")

    api_key = model_obj.api_key or ""
    if not api_key and model_obj.provider == "nvidia":
        api_key = settings.nvidia_api_key or ""

    if model_obj.provider == "nvidia" and not api_key:
        raise HTTPException(
            status_code=400,
            detail="NVIDIA API key is required. Set it in Settings.",
        )

    user_prompt = prompt.strip() or "Analyze this floor plan image and extract the design as a structured JSON specification. Identify room types, approximate dimensions, layout, connections between rooms, and building style."

    logger.info(
        "[IMPORT] Processing image: %s (%d bytes, %s) with model=%s/%s prompt=%r",
        file.filename, len(contents), file.content_type,
        model_obj.provider, model_obj.model_name, user_prompt,
    )

    try:
        definition = await call_llm_vision(
            image_base64=image_base64,
            prompt=user_prompt,
            provider=model_obj.provider,
            endpoint=model_obj.endpoint,
            model_name=model_obj.model_name,
            api_key=api_key,
        )
    except Exception as e:
        logger.error("[IMPORT] Vision LLM call failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=502,
            detail=f"AI analysis failed: {e}",
        )

    msg = (
        f"Imported from {file.filename or 'image'} using {model_obj.model_name}. "
        f"Detected {len(definition.rooms)} rooms, {definition.buildingType}, "
        f"{definition.style} style."
    )
    logger.info("[IMPORT] Success: %s", msg)

    return ImportImageResponse(json_definition=definition, message=msg)
