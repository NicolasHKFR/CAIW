import logging

from fastapi import APIRouter
from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session
from app.models.database import AppSetting
from app.models.schemas import SettingsResponse
from app.services.llm_service import SYSTEM_PROMPT

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])


def mask_key(key: str) -> str:
    if not key or len(key) < 8:
        return key
    return key[:6] + "****" + key[-4:]


def _coerce_value(v: str) -> bool | str:
    if v.lower() in ("true", "false"):
        return v.lower() == "true"
    return v


async def _load_settings() -> dict:
    data = {
        "mock_mode": settings.mock_ai,
        "llm_provider": settings.llm_provider,
        "llm_endpoint": settings.llm_endpoint,
        "llm_model": settings.llm_model,
        "nvidia_api_key": settings.nvidia_api_key,
        "nvidia_endpoint": settings.nvidia_endpoint,
        "nvidia_model": settings.nvidia_model,
        "openrouter_api_key": settings.openrouter_api_key,
        "openrouter_endpoint": settings.openrouter_endpoint,
        "openrouter_model": settings.openrouter_model,
        "image_endpoint": settings.image_endpoint,
    }
    try:
        async with async_session() as db:
            result = await db.execute(select(AppSetting))
            rows = result.scalars().all()
            for row in rows:
                data[row.key] = _coerce_value(row.value)
    except Exception as e:
        logger.warning("[SETTINGS] Failed to load from DB, using in-memory: %s", e)
    return data


async def _save_settings(data: dict) -> None:
    valid_keys = {
        "mock_mode", "llm_provider", "llm_endpoint", "llm_model",
        "nvidia_api_key", "nvidia_endpoint", "nvidia_model",
        "openrouter_api_key", "openrouter_endpoint", "openrouter_model",
        "image_endpoint",
    }
    try:
        async with async_session() as db:
            for key, value in data.items():
                if isinstance(value, bool):
                    value = str(value)
                if key in valid_keys:
                    existing = await db.execute(
                        select(AppSetting).where(AppSetting.key == key)
                    )
                    row = existing.scalar_one_or_none()
                    if row:
                        row.value = str(value)
                    else:
                        db.add(AppSetting(key=key, value=str(value)))
            await db.commit()
    except Exception as e:
        logger.warning("[SETTINGS] Failed to save to DB: %s", e)


@router.get("", response_model=SettingsResponse)
async def get_settings():
    data = await _load_settings()
    masked = dict(data)
    for k in ("nvidia_api_key", "openrouter_api_key"):
        masked[k] = mask_key(masked.get(k, ""))
    return SettingsResponse(**masked)


@router.put("", response_model=SettingsResponse)
async def update_settings(body: SettingsResponse):
    data = body.model_dump(exclude_unset=True)
    for k in ("nvidia_api_key", "openrouter_api_key"):
        val = data.get(k)
        if val and "****" in val:
            data.pop(k, None)
    await _save_settings(data)
    settings.apply_api_settings(data)
    logger.info("[SETTINGS] Updated runtime config: %s", {k: v for k, v in data.items() if "key" not in k.lower()})
    current = await _load_settings()
    return SettingsResponse(**current)


@router.get("/system-prompt", response_model=dict)
async def get_system_prompt():
    return {"prompt": SYSTEM_PROMPT}
