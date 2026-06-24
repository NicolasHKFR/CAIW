import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import httpx

from app.core.config import settings
from app.core.database import init_db
from app.core.logging import setup_logging, add_request_logging_middleware
from app.api import projects, designs, models, settings_api, ws, catalog, messages, export, import_api

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log_file = setup_logging(
        log_dir=settings.log_dir or None,
        level=settings.log_level,
        max_mb=settings.log_max_mb,
        backup_count=settings.log_backup_count,
    )
    logger.info("Logging to %s", log_file)
    logger.info("Initializing database...")
    await init_db()
    logger.info("Backend ready (mock_ai=%s)", settings.mock_ai)
    yield
    logger.info("Shutting down...")


app = FastAPI(title="CAIW - AI Design Studio", version="0.1.0", lifespan=lifespan)

add_request_logging_middleware(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(designs.router)
app.include_router(settings_api.router)
app.include_router(ws.router)
app.include_router(models.router)
app.include_router(catalog.router)
app.include_router(messages.router)
app.include_router(export.router)
app.include_router(import_api.router)

assets_dir = os.path.abspath(settings.assets_path)
os.makedirs(assets_dir, exist_ok=True)
app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


@app.get("/api/health")
async def health_check():
    comfy_connected = False
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            r = await client.get(f"{settings.image_endpoint.rstrip('/')}/")
            comfy_connected = r.status_code < 500
    except Exception:
        pass
    return {"status": "ok", "mock_ai": settings.mock_ai, "comfy_connected": comfy_connected}
