import asyncio
import json
import logging
import os
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select, func

from app.core.config import settings
from app.core.database import async_session
from app.models.database import Project, Design, ChatMessage as ChatMessageDB
from app.models.schemas import WsChatRequest
from app.services.orchestrator import run_generation_pipeline

logger = logging.getLogger(__name__)
router = APIRouter()

_active_generations: dict[str, asyncio.Task] = {}


@router.websocket("/api/ws/chat")
async def chat_websocket(websocket: WebSocket):
    await websocket.accept()

    logger.info("=" * 60)
    logger.info("[WS] CLIENT CONNECTED")

    async def heartbeat():
        try:
            while True:
                await asyncio.sleep(10)
                await websocket.send_json({"event": "ping"})
        except Exception:
            pass

    generation_project_id: str | None = None

    async with async_session() as db:
        hb_task = asyncio.create_task(heartbeat())
        try:
            data = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
            payload = json.loads(data)
            req = WsChatRequest(**payload)
            generation_project_id = req.project_id

            logger.info("[WS] RECEIVED | project=%s message=%r", req.project_id, req.message)
            logger.info("=" * 60)

            if len(req.message) > 2000:
                logger.warning("[WS] Message too long: %d chars", len(req.message))
                await websocket.send_json({
                    "event": "error",
                    "message": "Message too long (max 2000 characters)"
                })
                return

            project_result = await db.execute(
                select(Project).where(Project.id == req.project_id)
            )
            project = project_result.scalar_one_or_none()
            if not project:
                logger.warning("[WS] Project not found: %s", req.project_id)
                await websocket.send_json({
                    "event": "error",
                    "message": "Project not found"
                })
                return

            version_result = await db.execute(
                select(func.max(Design.version)).where(Design.project_id == req.project_id)
            )
            max_version = version_result.scalar() or 0
            next_version = max_version + 1
            logger.info("[WS] Next version: %d (previous max: %d)", next_version, max_version)

            assets_dir = f"{settings.assets_path}/{req.project_id}/v{next_version}"

            user_msg = ChatMessageDB(
                project_id=req.project_id,
                role="user",
                content=req.message,
            )
            db.add(user_msg)
            await db.commit()

            prev_task = _active_generations.get(req.project_id)
            if prev_task and not prev_task.done():
                logger.info("[WS] Cancelling previous generation for project %s", req.project_id)
                prev_task.cancel()

            design_data = None

            async def run_pipeline():
                nonlocal design_data
                try:
                    async for event in run_generation_pipeline(
                        prompt=req.message,
                        project_id=req.project_id,
                        version=next_version,
                        assets_dir=assets_dir,
                    ):
                        logger.info("[WS] SENDING EVENT | event=%s status=%s | data_keys=%s",
                                    event.get("event"), event.get("status", event.get("event")),
                                    list(event.keys()))
                        try:
                            await websocket.send_json(event)
                        except Exception:
                            logger.warning("[WS] Failed to send event — client may have disconnected")
                            return

                        if event.get("event") == "complete":
                            design_data = event.get("design", {})
                        elif event.get("event") == "error":
                            logger.warning("[WS] Pipeline returned error: %s", event.get("message"))
                            return
                except asyncio.CancelledError:
                    logger.info("[WS] Pipeline task cancelled")
                    raise

            task = asyncio.create_task(run_pipeline())
            _active_generations[req.project_id] = task

            try:
                await task
            except asyncio.CancelledError:
                logger.info("[WS] Generation cancelled for project %s", req.project_id)
                try:
                    await websocket.send_json({"event": "error", "message": "Generation cancelled by new request"})
                except Exception:
                    pass
                return
            finally:
                if _active_generations.get(req.project_id) is task:
                    del _active_generations[req.project_id]

            if design_data:
                design = Design(
                    project_id=req.project_id,
                    version=next_version,
                    json_definition=json.dumps(design_data.get("json_definition", {})),
                    rendering_image_path=design_data.get("rendering_image_path"),
                    floor_plan_image_path=design_data.get("floor_plan_image_path"),
                )
                db.add(design)
                asst_msg = ChatMessageDB(
                    project_id=req.project_id,
                    role="assistant",
                    content="I've successfully generated the layout and concept design!",
                )
                db.add(asst_msg)
                await db.commit()
                logger.info("[WS] DESIGN SAVED | project=%s version=%d", req.project_id, next_version)

            logger.info("=" * 60)
            logger.info("[WS] GENERATION COMPLETE | project=%s version=%d", req.project_id, next_version)
            logger.info("=" * 60)

        except WebSocketDisconnect:
            logger.info("[WS] CLIENT DISCONNECTED")
            if generation_project_id:
                task = _active_generations.get(generation_project_id)
                if task and not task.done():
                    task.cancel()
        except asyncio.TimeoutError:
            logger.warning("[WS] Timed out waiting for client message")
            try:
                await websocket.send_json({"event": "error", "message": "Request timed out"})
            except Exception:
                pass
        except Exception as e:
            logger.error("[WS] ERROR: %s", e, exc_info=True)
            try:
                await websocket.send_json({"event": "error", "message": f"Internal error: {str(e)}"})
            except Exception:
                pass
        finally:
            hb_task.cancel()
            if generation_project_id and generation_project_id in _active_generations:
                task = _active_generations[generation_project_id]
                if not task.done():
                    task.cancel()
                del _active_generations[generation_project_id]
