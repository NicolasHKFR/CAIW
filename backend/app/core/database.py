import asyncio
import logging
from typing import TypeVar

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T")

engine = create_async_engine(settings.db_url, echo=False, connect_args={"check_same_thread": False})
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


_MAX_RETRIES = 3
_RETRY_DELAY = 0.1


async def with_retry(fn, *args, **kwargs):
    for attempt in range(_MAX_RETRIES):
        try:
            return await fn(*args, **kwargs)
        except Exception as e:
            if "database is locked" in str(e).lower() and attempt < _MAX_RETRIES - 1:
                logger.warning("[DB] Locked, retrying (%d/%d): %s", attempt + 1, _MAX_RETRIES, e)
                await asyncio.sleep(_RETRY_DELAY * (attempt + 1))
                continue
            raise


async def _seed_default_models(db):
    from app.models.database import Model

    nem = Model(
        provider="openrouter",
        model_name=settings.openrouter_model,
        endpoint=settings.openrouter_endpoint,
        api_key=settings.openrouter_api_key,
        model_type="chat",
        is_active=True,
    )
    db.add(nem)

    kimi = Model(
        provider="nvidia",
        model_name=settings.nvidia_model,
        endpoint=settings.nvidia_endpoint,
        api_key=settings.nvidia_api_key,
        model_type="chat",
        is_active=False,
    )
    db.add(kimi)


async def init_db():
    async with engine.begin() as conn:
        await conn.execute(text("PRAGMA journal_mode=WAL"))
        await conn.execute(text("PRAGMA foreign_keys=ON"))
        from app.models.database import Project, Design, Model
        await conn.run_sync(Base.metadata.create_all)

    try:
        async with engine.begin() as conn:
            await conn.execute(
                text("ALTER TABLE models ADD COLUMN model_type VARCHAR(16) DEFAULT 'chat'")
            )
    except Exception:
        pass

    try:
        async with engine.begin() as conn:
            await conn.execute(
                text("ALTER TABLE models ADD COLUMN api_key_iv VARCHAR(64) DEFAULT ''")
            )
    except Exception:
        pass

    async with async_session() as db:
        existing = await db.execute(select(func.count(Model.id)))
        if existing.scalar() == 0:
            await _seed_default_models(db)
            await db.commit()
            logger.info("[DB] Seeded default models: OpenRouter/Nemotron (active) + NVIDIA/Kimi")

        active = await db.execute(select(Model).where(Model.is_active == True))
        m = active.scalar_one_or_none()
        if m and m.provider == "openrouter" and m.model_name == "nvidia/nemotron-3-ultra-550b-a55b:free":
            m.model_name = "openrouter/free"
            await db.commit()
            logger.info("[DB] Migrated active model: nemotron → openrouter/free")
