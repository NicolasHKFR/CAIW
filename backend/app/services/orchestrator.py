import json
import logging
import os
from typing import AsyncIterator

from sqlalchemy import select

from app.core.config import settings
from app.core.config import settings
from app.core.database import async_session
from app.models.database import Model
from app.models.schemas import DesignDefinition, WsProgress, WsComplete, WsError
from app.solver.layout import solve_layout, validate_layout, auto_generate_hallway, MOCK_DEFINITION, LayoutError
from app.services.llm_service import call_llm, MOCK_RESPONSE
from app.services.image_service import _generate_floor_plan_svg

logger = logging.getLogger(__name__)


async def run_generation_pipeline(
    prompt: str,
    project_id: str,
    version: int,
    assets_dir: str,
) -> AsyncIterator[dict]:
    yield WsProgress(status="parsing", message="AI is parsing your request and analyzing requirements...").model_dump()

    if settings.mock_ai:
        logger.info("[ORCH] MOCK MODE — using pre-baked definition")
        definition = MOCK_RESPONSE.model_copy(deep=True)
    else:
        try:
            async with async_session() as db:
                result = await db.execute(select(Model).where(Model.is_active == True))
                active_model = result.scalar_one_or_none()

            if not active_model:
                raise ValueError("No active model configured. Add a model in Settings.")

            api_key = active_model.api_key or ""
            if not api_key and active_model.provider == "nvidia":
                api_key = settings.nvidia_api_key or ""

            logger.info(
                "[ORCH] Calling LLM | provider=%s model=%s endpoint=%s",
                active_model.provider, active_model.model_name, active_model.endpoint,
            )
            definition = await call_llm(
                prompt=prompt,
                provider=active_model.provider,
                endpoint=active_model.endpoint,
                model_name=active_model.model_name,
                api_key=api_key,
                model_type=active_model.model_type,
            )
        except Exception as e:
            logger.error("[ORCH] LLM parsing failed: %s", e, exc_info=True)
            yield WsError(message=f"Failed to parse design request: {e}").model_dump()
            return

    _verify_llm_output(definition, prompt)

    yield WsProgress(status="solving", message="Arranging rooms and validating connectivity rules...").model_dump()

    definition = auto_generate_hallway(definition)

    pre_solve_rooms = len(definition.rooms)
    pre_solve_ids = {r.id for r in definition.rooms}

    try:
        definition = solve_layout(definition)
    except LayoutError as e:
        logger.error("[ORCH] Layout solver failed: %s", e)
        yield WsError(message=f"Layout solver failed: {e}").model_dump()
        return

    post_solve_ids = {r.id for r in definition.rooms}
    if pre_solve_ids != post_solve_ids:
        missing = pre_solve_ids - post_solve_ids
        extra = post_solve_ids - pre_solve_ids
        logger.warning(
            "[ORCH] Room mismatch after solve! missing=%s extra=%s",
            missing, extra,
        )
    else:
        logger.info(
            "[ORCH] Room count verified: %d rooms (same IDs before/after solve)",
            pre_solve_rooms,
        )

    is_valid, errors = validate_layout(definition)
    if not is_valid:
        logger.warning("[ORCH] Layout validation FAILED: %s", "; ".join(errors))
        yield WsError(message=f"Layout validation failed: {'; '.join(errors[:5])}").model_dump()
        return
    logger.info("[ORCH] Layout validation passed — all 10 acceptance criteria satisfied")

    yield WsProgress(status="rendering", message="Generating floor plan layout...").model_dump()

    os.makedirs(assets_dir, exist_ok=True)
    definition_dict = json.loads(definition.model_dump_json())

    import aiofiles
    svg_content = _generate_floor_plan_svg(definition_dict)
    plan_path = os.path.join(assets_dir, "floor_plan.svg")
    async with aiofiles.open(plan_path, "w") as f:
        await f.write(svg_content)

    render_path = None

    def to_url(p: str | None) -> str | None:
        if not p:
            return None
        abs_assets = os.path.abspath(settings.assets_path)
        if os.path.exists(p) and abs_assets in os.path.abspath(p):
            rel = os.path.relpath(p, abs_assets)
            return "/assets/" + rel.replace("\\", "/")
        return p

    design_data = {
        "version": version,
        "json_definition": definition_dict,
        "rendering_image_path": to_url(render_path),
        "floor_plan_image_path": to_url(plan_path),
    }

    logger.info(
        "[ORCH] Generation complete | project=%s version=%d rooms=%d style=%s "
        "has_render=%s has_plan=%s",
        project_id, version, len(definition.rooms), definition.style,
        "yes" if render_path else "no",
        "yes" if plan_path else "no",
    )
    logger.debug("[ORCH] Final definition_dict:\n%s", json.dumps(definition_dict, indent=2))

    yield WsComplete(
        design=design_data,
        message="I've successfully generated the layout and concept design! What do you think?"
    ).model_dump()


def _verify_llm_output(definition: DesignDefinition, prompt: str) -> None:
    room_count = len(definition.rooms)
    total_area = sum(r.targetArea for r in definition.rooms)
    room_types = [r.type for r in definition.rooms]

    logger.info(
        "[ORCH] LLM output summary: buildingType=%s style=%s "
        "surfaceArea=%sm² rooms=%d total_requested=%sm² types=%s",
        definition.buildingType, definition.style,
        definition.totalSurfaceArea, room_count, total_area, room_types,
    )

    if room_count == 0:
        logger.warning("[ORCH] LLM returned ZERO rooms — design will be empty!")

    keywords = ["bedroom", "bathroom", "kitchen", "living", "hallway"]
    mentioned = [kw for kw in keywords if kw.lower() in prompt.lower()]
    found = [kw for kw in mentioned if kw in room_types]
    if mentioned and len(found) < len(mentioned):
        missing = set(mentioned) - set(found)
        logger.warning(
            "[ORCH] Prompt mentioned room types %s but LLM output "
            "missing: %s — design may not match user request",
            mentioned, missing,
        )
