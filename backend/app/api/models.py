import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.database import Model
from app.models.schemas import ModelCreate, ModelUpdate, ModelResponse
from app.services.llm_service import test_llm_connection, fetch_available_models

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/models", tags=["models"])


from app.api.settings_api import mask_key

VISION_KEYWORDS = [
    "vision", "llava", "internvl", "cogvlm", "qwen-vl", "qwen2-vl",
    "gpt-4o", "gpt-4-vision", "gpt-4-turbo", "claude-3", "gemini",
    "idefics", "florence", "fuyu", "paligemma", "phi-3-vision",
    "deepseek-vl", "yi-vision", "minicpm-v", "mplug",
]


def _detect_vision(model_name: str) -> bool:
    name = model_name.lower()
    return any(kw in name for kw in VISION_KEYWORDS)


def _to_response(m: Model) -> ModelResponse:
    return ModelResponse(
        id=m.id,
        provider=m.provider,
        model_name=m.model_name,
        endpoint=m.endpoint,
        api_key=mask_key(m.api_key),
        model_type=m.model_type,
        is_active=m.is_active,
        supports_vision=_detect_vision(m.model_name),
        created_at=m.created_at,
    )


@router.get("", response_model=list[ModelResponse])
async def list_models(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Model).order_by(Model.created_at.desc()))
    return [_to_response(m) for m in result.scalars().all()]


@router.post("", response_model=ModelResponse, status_code=201)
async def create_model(body: ModelCreate, db: AsyncSession = Depends(get_db)):
    model = Model(
        provider=body.provider,
        model_name=body.model_name,
        endpoint=body.endpoint,
        api_key=body.api_key,
        is_active=False,
    )
    db.add(model)
    await db.commit()
    await db.refresh(model)
    logger.info("[MODELS] Created model: %s/%s", body.provider, body.model_name)
    return _to_response(model)


@router.put("/{model_id}", response_model=ModelResponse)
async def update_model(model_id: str, body: ModelUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Model).where(Model.id == model_id))
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    data = body.model_dump(exclude_unset=True)
    if "api_key" in data and "****" in data["api_key"]:
        data.pop("api_key")
    for key, val in data.items():
        setattr(model, key, val)
    await db.commit()
    await db.refresh(model)
    return _to_response(model)


@router.delete("/{model_id}", status_code=204)
async def delete_model(model_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Model).where(Model.id == model_id))
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    await db.delete(model)
    await db.commit()
    logger.info("[MODELS] Deleted model: %s", model_id)


@router.get("/discover", response_model=list[str])
async def discover_models(provider: str, endpoint: str):
    try:
        models = await fetch_available_models(provider, endpoint)
        logger.info("[MODELS] Discovered %d models for %s at %s", len(models), provider, endpoint)
        return models
    except Exception as e:
        logger.warning("[MODELS] Model discovery failed for %s at %s: %s", provider, endpoint, e)
        raise HTTPException(status_code=502, detail=str(e))


@router.put("/{model_id}/test", response_model=dict)
async def test_model(model_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Model).where(Model.id == model_id))
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    api_key = model.api_key or ""
    if not api_key and model.provider == "nvidia":
        api_key = settings.nvidia_api_key or ""

    if model.provider == "nvidia" and not api_key:
        raise HTTPException(
            status_code=400,
            detail="NVIDIA API key is required. Set it in Settings → NVIDIA API Key before testing.",
        )

    try:
        result_data = await test_llm_connection(
            provider=model.provider,
            endpoint=model.endpoint,
            model_name=model.model_name,
            api_key=api_key,
            model_type=model.model_type,
        )
        logger.info("[MODELS] Connection test OK for model %s/%s", model.provider, model.model_name)
        return result_data
    except Exception as e:
        logger.warning("[MODELS] Connection test FAILED for model %s/%s: %s", model.provider, model.model_name, e)
        raise HTTPException(status_code=502, detail=str(e))


@router.put("/{model_id}/activate", response_model=ModelResponse)
async def activate_model(model_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Model).where(Model.id == model_id))
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    await db.execute(update(Model).values(is_active=False))
    model.is_active = True
    await db.commit()
    await db.refresh(model)
    logger.info("[MODELS] Activated model: %s/%s", model.provider, model.model_name)
    return _to_response(model)
