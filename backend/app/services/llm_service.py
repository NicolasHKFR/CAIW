import json
import logging
from typing import Any

import httpx

from app.models.schemas import DesignDefinition, RoomSpec, FurnitureItem

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an AI architectural layout designer. Your job is to convert a user's free-text description into a precise, structured JSON design specification.

## JSON Schema (respond with exactly this structure)

{
  "buildingType": "<string: apartment | house | studio | office | retail>",
  "totalSurfaceArea": <number: total floor area in m² — default 90 if not specified>,
  "style": "<string: scandinavian | modern | japanese | industrial | traditional | minimalist | bohemian | midcentury | coastal | rustic>",
  "aspectRatio": <number | null: optional width/height ratio of the footprint — e.g. 1.5 means 1.5× wider than tall. Omit or set null for default>,
  "rooms": [
    {
      "id": "<string: unique identifier e.g. living_room, bedroom_1, kitchen>",
      "type": "<string — see allowed types below>",
      "targetArea": <number: requested area in m²>,
      "preferredConnections": ["<room_id>", "<room_id>", ...],
      "furniture": [
        {
          "id": "<string: unique furniture item id>",
          "name": "<string: e.g. sofa, double bed, dining table, kitchen island, bathtub>",
          "x": <number: X position in meters RELATIVE to room's top-left corner>,
          "y": <number: Y position in meters RELATIVE to room's top-left corner>,
          "width": <number: width in meters>,
          "length": <number: length (depth) in meters>
        }
      ],
      "floor": <number: floor level — 0=basement, 1=ground floor (default), 2=upper floor, etc.>,
      "connectedFloor": <number | null: for stairs only — which floor this staircase connects to. null for non-stairs rooms.>
    }
  ],
  "materials": [
    {
      "name": "<string: material name e.g. Oak Hardwood Flooring>",
      "description": "<string: brief description>",
      "estimatedCostPerM2": <number: estimated cost per square meter>,
      "unit": "<string: unit of measurement, default m²>"
    }
  ],
  "estimatedBudget": {
    "totalEstimated": <number: total estimated budget in USD>,
    "currency": "<string: currency code, default USD>",
    "items": [
      {"category": "<string: e.g. Flooring>", "amount": <number>}
    ]
  } | null
}

## Allowed room types (use only these)

living_room, bedroom, bedroom_2, bedroom_3, bedroom_4, bedroom_5,
kitchen, bathroom, hallway, hall, landing, dining_room, family_room,
office, laundry, storage, walk_in_closet, master_suite, master_bathroom,
guest_wc, ensuite, balcony, pantry, mudroom, gym, playroom, library, workshop,
sunroom, nursery, lobby, stairs, terrace, garage

## Rules (strictly enforced)

1. The sum of all room targetAreas MUST NOT exceed totalSurfaceArea.
2. All room ids MUST be unique.
3. targetArea must be ≥ 4 m² for any room. Minimums: bedroom ≥ 9 m², bathroom ≥ 3 m², kitchen ≥ 6 m².
4. Living rooms, kitchens, and hallways are the main circulation spaces — they should have connections to multiple rooms.
5. Bedrooms should connect to at least a hallway or bathroom.
6. Each room type appears at least once if mentioned by the user (if user says "2 bedrooms" you need bedroom_1 and bedroom_2).
7. preferredConnections lists room IDs this room SHOULD be adjacent to (helps the solver create sensible layouts).
8. Hallways/ corridors should be present if the layout has more than 3 rooms — they are the circulation backbone.
9. If the user requests multiple floors, a basement, or stairs, assign each room a floor integer (0=basement, 1=ground floor, 2=upper floor, etc.). Default is 1.
10. Add stairs rooms with connectedFloor set to the destination floor. Each floor with rooms must connect to at least one adjacent floor via stairs.
11. totalSurfaceArea is the sum across ALL floors. Distribute area proportionally per floor.

## Furniture placement guidelines

Include relevant furniture in each room. Use these common furniture items as a guide:

- **living_room**: sofa (2.2×0.9m), coffee table (1.0×0.6m), TV unit (1.8×0.4m), bookshelf (0.8×0.3m)
- **bedroom**: double bed (2.0×1.6m), wardrobe (1.2×0.6m), nightstand (0.5×0.5m)
- **kitchen**: kitchen island (2.5×0.8m), dining table (1.6×0.9m), chairs (0.5×0.5m)
- **bathroom**: bathtub (1.7×0.7m), toilet (0.4×0.6m), sink (0.6×0.5m)
- **dining**: dining table (1.8×0.9m), chairs (0.5×0.5m), sideboard (1.2×0.4m)
- **office**: desk (1.4×0.7m), office chair (0.6×0.6m), bookshelf (0.8×0.3m)
- **hallway**: shoe cabinet (0.8×0.3m), coat rack (0.5×0.5m)
- **balcony**: small table (0.6×0.6m), chair (0.5×0.5m)
- **stairs**: staircase (2.5×1.0m), handrail (2.5×0.1m)

Place furniture coordinates RELATIVE to the room's top-left corner (x=0, y=0 is the room's top-left). Keep furniture away from walls by at least 0.3m. Do not overlap furniture items.

## Constraints & hints

- - For multi-floor designs, the totalSurfaceArea is the sum of all floors. Distribute proportionally.
If the user says e.g. "90m² apartment, 2 bedrooms, open kitchen", targetArea for living+kitchen combined should be ≈35-50% of total.
- Think about which rooms must be adjacent (e.g. kitchen ↔ dining, bedroom ↔ ensuite, bathroom ↔ hallway).
- If the user doesn't specify a style, default to "scandinavian".
- If the user doesn't specify total area, default to 90 m².
- Distribute area proportionally: living room largest (30-40%), bedrooms moderate (12-20 m² each), bathrooms small (4-8 m²).

## Example

User: "70m² modern apartment with one bedroom, open kitchen, and a balcony"

Response:
{
  "buildingType": "apartment",
  "totalSurfaceArea": 70,
  "style": "modern",
  "rooms": [
    {
      "id": "living_dining",
      "type": "living_room",
      "targetArea": 26,
      "preferredConnections": ["kitchen", "hallway", "balcony"],
      "furniture": [
        {"id": "sofa_1", "name": "sofa", "x": 1.5, "y": 2.5, "width": 2.2, "length": 0.9},
        {"id": "table_1", "name": "dining table", "x": 5.0, "y": 1.5, "width": 1.6, "length": 0.9}
      ]
    },
    {
      "id": "kitchen",
      "type": "kitchen",
      "targetArea": 10,
      "preferredConnections": ["living_dining"],
      "furniture": [
        {"id": "island_1", "name": "kitchen island", "x": 1.0, "y": 1.0, "width": 2.5, "length": 0.8}
      ]
    },
    {
      "id": "bedroom_1",
      "type": "bedroom",
      "targetArea": 16,
      "preferredConnections": ["hallway", "bathroom"],
      "furniture": [
        {"id": "bed_1", "name": "double bed", "x": 2.0, "y": 2.0, "width": 2.0, "length": 1.6},
        {"id": "wardrobe_1", "name": "wardrobe", "x": 0.5, "y": 0.5, "width": 1.2, "length": 0.6}
      ]
    },
    {
      "id": "bathroom",
      "type": "bathroom",
      "targetArea": 6,
      "preferredConnections": ["hallway"],
      "furniture": [
        {"id": "tub_1", "name": "bathtub", "x": 0.5, "y": 1.0, "width": 1.7, "length": 0.7}
      ]
    },
    {
      "id": "hallway",
      "type": "hallway",
      "targetArea": 7,
      "preferredConnections": ["living_dining", "bedroom_1", "bathroom"],
      "furniture": [
        {"id": "shoe_1", "name": "shoe cabinet", "x": 0.5, "y": 0.5, "width": 0.8, "length": 0.3}
      ]
    },
    {
      "id": "balcony",
      "type": "balcony",
      "targetArea": 5,
      "preferredConnections": ["living_dining"],
      "furniture": []
    }
  ]
}

Only respond with valid JSON. Do NOT include any other text, explanation, markdown, or code fences. Return ONLY the JSON object."""


def _normalize_endpoint(endpoint: str) -> str:
    return endpoint.rstrip("/").removesuffix("/v1")


def _parse_llm_response(text: str) -> dict[str, Any]:
    original = text
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines)
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    try:
        parsed = json.loads(text)
        logger.info(
            "[LLM] Parsed JSON successfully from %d-char response "
            "(stripped %d chars of wrapping)",
            len(original), len(original) - len(text),
        )
        return parsed
    except json.JSONDecodeError as e:
        logger.error("[LLM] JSON parse failed: %s | raw snippet: %r", e, text[:500])
        raise


async def call_llm(
    prompt: str, provider: str, endpoint: str, model_name: str, api_key: str,
    model_type: str = "chat",
) -> DesignDefinition:
    logger.info("=" * 60)
    logger.info("[LLM] CALL START | provider=%s model=%s model_type=%s", provider, model_name, model_type)
    logger.info("=" * 60)
    logger.info("[LLM] FULL SYSTEM PROMPT:\n%s", SYSTEM_PROMPT)
    logger.info("[LLM] FULL USER MESSAGE:\n%s", prompt)

    if provider == "ollama":
        result = await _call_ollama(prompt, endpoint, model_name)
    elif provider in ("nvidia", "openai", "lmstudio"):
        if provider == "nvidia" and not api_key:
            raise ValueError("API key not configured for this model. Set it in Settings.")
        result = await _call_openai(prompt, endpoint, model_name, api_key, model_type)
    else:
        raise ValueError(f"Unknown LLM provider: {provider}")

    logger.info("=" * 60)
    logger.info("[LLM] CALL END | provider=%s", provider)
    logger.info("=" * 60)
    return result


async def _call_ollama(prompt: str, endpoint: str, model: str) -> DesignDefinition:
    base = _normalize_endpoint(endpoint)
    full_prompt = f"{SYSTEM_PROMPT}\n\nUser request: {prompt}"
    payload = {
        "model": model,
        "prompt": full_prompt,
        "stream": False,
    }
    logger.info("[LLM] REQUEST | url=%s/api/generate | model=%s", base, model)

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f"{base}/api/generate", json=payload)
        logger.info("[LLM] RESPONSE | status=%d", resp.status_code)
        resp.raise_for_status()
        data = resp.json()
        raw = data.get("response", "")

    logger.info("[LLM] RAW RESPONSE BODY (%d chars):\n%s", len(raw), raw)
    logger.info("-" * 60)
    parsed = _parse_llm_response(raw)
    result = _to_definition(parsed)
    _log_definition("Ollama", result, parsed)
    return result


async def _call_ollama_vision(image_base64: str, prompt: str, endpoint: str, model: str) -> DesignDefinition:
    base = _normalize_endpoint(endpoint)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"User request: {prompt}"},
    ]
    payload = {
        "model": model,
        "messages": messages,
        "images": [image_base64],
        "stream": False,
    }
    logger.info("[LLM] REQUEST VISION | url=%s/api/chat | model=%s", base, model)

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f"{base}/api/chat", json=payload)
        logger.info("[LLM] RESPONSE | status=%d", resp.status_code)
        resp.raise_for_status()
        data = resp.json()
        raw = data.get("message", {}).get("content", "")

    logger.info("[LLM] RAW RESPONSE BODY (%d chars):\n%s", len(raw), raw)
    logger.info("-" * 60)
    parsed = _parse_llm_response(raw)
    result = _to_definition(parsed)
    _log_definition("Ollama-Vision", result, parsed)
    return result


def _build_design_tool_schema() -> dict:
    return {
        "type": "function",
        "function": {
            "name": "generate_design",
            "description": "Generate an architectural floor plan design specification from a natural language description.",
            "parameters": {
                "type": "object",
                "properties": {
                    "buildingType": {
                        "type": "string",
                        "enum": ["apartment", "house", "studio", "office", "retail"],
                        "description": "Type of building",
                    },
                    "totalSurfaceArea": {
                        "type": "number",
                        "description": "Total floor area in m²",
                    },
                    "style": {
                        "type": "string",
                        "enum": [
                            "scandinavian", "modern", "japanese", "industrial",
                            "traditional", "minimalist", "bohemian", "midcentury",
                            "coastal", "rustic",
                        ],
                        "description": "Architectural style",
                    },
                    "rooms": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string", "description": "Unique identifier e.g. living_room, bedroom_1"},
                                "type": {
                                    "type": "string",
                                    "enum": [
                                        "living_room", "bedroom", "bedroom_2", "bedroom_3", "bedroom_4", "bedroom_5",
                                        "kitchen", "bathroom", "hallway", "hall", "landing", "dining_room",
                                        "family_room", "master_suite", "master_bathroom", "guest_wc", "ensuite",
                                        "office", "laundry", "storage", "walk_in_closet", "balcony", "pantry",
                                        "mudroom", "gym", "playroom", "library", "workshop", "sunroom",
                                        "nursery", "lobby", "stairs", "terrace", "garage",
                                    ],
                                },
                                "targetArea": {"type": "number", "description": "Requested area in m²"},
                                "preferredConnections": {
                                    "type": "array", "items": {"type": "string"},
                                    "description": "Room IDs this room should be adjacent to",
                                },
                                "floor": {"type": "integer", "description": "Floor level: 0=basement, 1=ground (default), 2=upper"},
                                "connectedFloor": {"type": ["integer", "null"], "description": "For stairs only: the destination floor"},
                                "furniture": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "id": {"type": "string"},
                                            "name": {"type": "string", "description": "e.g. sofa, double bed, dining table"},
                                            "x": {"type": "number", "description": "X position in meters relative to room top-left"},
                                            "y": {"type": "number", "description": "Y position in meters relative to room top-left"},
                                            "width": {"type": "number", "description": "Width in meters"},
                                            "length": {"type": "number", "description": "Length in meters"},
                                        },
                                        "required": ["id", "name", "x", "y", "width", "length"],
                                    },
                                },
                            },
                            "required": ["id", "type", "targetArea", "preferredConnections", "furniture"],
                        },
                    },
                },
                "required": ["buildingType", "totalSurfaceArea", "style", "rooms"],
            },
        },
    }


def _strip_reasoning(text: str) -> str:
    import re
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    text = re.sub(r'\[THINK\].*?\[/THINK\]', '', text, flags=re.DOTALL)
    text = re.sub(r'^.*?<｜end▁of▁thinking｜>', '', text, flags=re.DOTALL)
    text = text.strip()
    return text


async def _call_openai(
    prompt: str, endpoint: str, model: str, api_key: str,
    model_type: str = "chat",
) -> DesignDefinition:
    base = _normalize_endpoint(endpoint)
    logger.info("[LLM] CALL START | model=%s model_type=%s endpoint=%s", model, model_type, base)

    if model_type == "reasoning":
        full_prompt = f"{SYSTEM_PROMPT}\n\nUser request: {prompt}"
        messages = [{"role": "user", "content": full_prompt}]
        max_tokens = 8192
        temperature = 0.0
    else:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"User request: {prompt}"},
        ]
        max_tokens = 4096
        temperature = 0.7

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    max_retries = 2

    for attempt in range(max_retries + 1):
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": 1.0,
            "stream": False,
        }

        if model_type == "tools" and attempt == 0:
            payload["tools"] = [_build_design_tool_schema()]
            payload["tool_choice"] = {"type": "function", "function": {"name": "generate_design"}}

        logger.info("[LLM] REQUEST attempt=%d | url=%s/v1/chat/completions | model=%s", attempt, base, model)
        payload_log = {**payload, "messages": [{"role": m["role"], "content": "(truncated)"} for m in messages[:2]]}
        logger.info("[LLM] FULL PAYLOAD:\n%s", json.dumps(payload_log, indent=2))

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{base}/v1/chat/completions",
                json=payload,
                headers=headers,
            )
            logger.info("[LLM] RESPONSE attempt=%d | status=%d", attempt, resp.status_code)
            resp.raise_for_status()
            data = resp.json()

        choices = data.get("choices")
        if not choices or not isinstance(choices, list) or len(choices) == 0:
            raise ValueError(
                f"LLM returned no completion choices. "
                f"Response keys: {list(data.keys())}. "
                f"Check that the model at {endpoint} supports chat completions."
            )

        usage = data.get("usage", {})

        try:
            if model_type == "tools" and attempt == 0:
                tc = choices[0].get("message", {}).get("tool_calls")
                if not tc:
                    raise ValueError("Model type is 'tools' but response contained no tool_calls — fallback content: " + choices[0].get("message", {}).get("content", "")[:200])
                raw_args = tc[0]["function"]["arguments"]
                logger.info("[LLM] TOOL ARGS (%d chars):\n%s", len(raw_args), raw_args)
                parsed = json.loads(raw_args)
            else:
                raw = choices[0].get("message", {}).get("content", "") or ""
                logger.info(
                    "[LLM] RAW RESPONSE BODY (%d chars, prompt_tokens=%s, completion_tokens=%s):\n%s",
                    len(raw), usage.get("prompt_tokens", "?"), usage.get("completion_tokens", "?"),
                    raw,
                )
                logger.info("-" * 60)
                if model_type == "reasoning":
                    raw = _strip_reasoning(raw)
                parsed = _parse_llm_response(raw)
        except json.JSONDecodeError as e:
            if attempt >= max_retries:
                logger.error("[LLM] All %d retries exhausted", max_retries + 1)
                raise
            logger.warning("[LLM] JSON parse failed attempt=%d, sending correction prompt: %s", attempt, e)
            broken = raw_args if (model_type == "tools" and attempt == 0) else raw
            messages = [
                *messages,
                {"role": "assistant", "content": broken},
                {"role": "user", "content": f"The JSON you returned has syntax errors: {e}. Fix all syntax errors and return ONLY valid JSON matching the required schema. No markdown wrapping, no explanation."},
            ]
            continue
        break

    result = _to_definition(parsed)
    _log_definition(model, result, parsed)
    return result


async def _call_openai_vision(
    image_base64: str, prompt: str, endpoint: str, model: str, api_key: str,
) -> DesignDefinition:
    base = _normalize_endpoint(endpoint)
    logger.info("[LLM] CALL VISION START | model=%s endpoint=%s", model, base)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": f"User request: {prompt}"},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_base64}"}},
            ],
        },
    ]

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": 4096,
        "temperature": 0.7,
        "top_p": 1.0,
        "stream": False,
        "tools": [_build_design_tool_schema()],
        "tool_choice": {"type": "function", "function": {"name": "generate_design"}},
    }

    logger.info("[LLM] REQUEST VISION | url=%s/v1/chat/completions | model=%s", base, model)

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(
            f"{base}/v1/chat/completions",
            json=payload,
            headers=headers,
        )
        logger.info("[LLM] RESPONSE VISION | status=%d", resp.status_code)
        resp.raise_for_status()
        data = resp.json()

    choices = data.get("choices")
    if not choices or not isinstance(choices, list) or len(choices) == 0:
        raise ValueError("LLM returned no completion choices for vision request.")

    tc = choices[0].get("message", {}).get("tool_calls")
    if tc:
        raw_args = tc[0]["function"]["arguments"]
        logger.info("[LLM] VISION TOOL ARGS (%d chars):\n%s", len(raw_args), raw_args)
        parsed = json.loads(raw_args)
    else:
        raw = choices[0].get("message", {}).get("content", "") or ""
        logger.info("[LLM] VISION RAW (%d chars):\n%s", len(raw), raw)
        parsed = _parse_llm_response(raw)

    result = _to_definition(parsed)
    _log_definition("Vision-" + model, result, parsed)
    return result


async def call_llm_vision(
    image_base64: str, prompt: str, provider: str, endpoint: str,
    model_name: str, api_key: str,
) -> DesignDefinition:
    logger.info("=" * 60)
    logger.info("[LLM] VISION CALL START | provider=%s model=%s", provider, model_name)
    logger.info("=" * 60)

    if provider == "ollama":
        result = await _call_ollama_vision(image_base64, prompt, endpoint, model_name)
    elif provider in ("nvidia", "openai", "lmstudio"):
        if provider == "nvidia" and not api_key:
            raise ValueError("API key not configured for this model. Set it in Settings.")
        result = await _call_openai_vision(image_base64, prompt, endpoint, model_name, api_key)
    else:
        raise ValueError(f"Unknown LLM provider for vision: {provider}")

    logger.info("=" * 60)
    logger.info("[LLM] VISION CALL END | provider=%s", provider)
    logger.info("=" * 60)
    return result


def _to_definition(data: dict) -> DesignDefinition:
    rooms = []
    for r in data.get("rooms", []):
        furniture = []
        for f in r.get("furniture", []):
            if "name" not in f or not f["name"]:
                for alt in ("type", "item", "label", " balancer"):
                    if alt in f and f[alt]:
                        f["name"] = f[alt]
                        break
                else:
                    f["name"] = f.get("id", "furniture")
            furniture.append(FurnitureItem(**f))
        rooms.append(RoomSpec(
            id=r.get("id", f"{r.get('type', 'room')}_{len(rooms)}"),
            type=r.get("type", "room"),
            targetArea=float(r.get("targetArea", 10)),
            preferredConnections=r.get("preferredConnections", []),
            furniture=furniture,
            floor=int(r.get("floor", 1)),
            connectedFloor=r.get("connectedFloor"),
        ))
    return DesignDefinition(
        buildingType=data.get("buildingType", "apartment"),
        totalSurfaceArea=float(data.get("totalSurfaceArea", 90)),
        style=data.get("style", "scandinavian"),
        rooms=rooms,
    )


def _log_definition(source: str, defn: DesignDefinition, raw: dict) -> None:
    room_lines = ", ".join(
        f"{r.type}({r.id}, {r.targetArea}m²)" for r in defn.rooms
    )
    logger.info(
        "[LLM] %s → DesignDefinition: buildingType=%s, style=%s, "
        "totalArea=%sm², rooms=[%s]",
        source, defn.buildingType, defn.style, defn.totalSurfaceArea, room_lines,
    )
    total_requested = sum(r.targetArea for r in defn.rooms)
    if total_requested > defn.totalSurfaceArea:
        logger.warning(
            "[LLM] Room areas sum (%sm²) exceeds total surface area (%sm²) "
            "by %sm² — solver will squeeze last rooms",
            total_requested, defn.totalSurfaceArea,
            total_requested - defn.totalSurfaceArea,
        )
    for r in defn.rooms:
        if r.preferredConnections:
            logger.info(
                "[LLM]   %s (%s) wants connections to: %s",
                r.id, r.type, ", ".join(r.preferredConnections),
            )


async def test_llm_connection(
    provider: str, endpoint: str, model_name: str, api_key: str,
    model_type: str = "chat",
) -> dict:
    logger.info("[LLM] Testing connection | provider=%s model=%s endpoint=%s model_type=%s", provider, model_name, endpoint, model_type)

    prompt = (
        "Design a compact 70m\u00b2 apartment in scandinavian style "
        "with a living room, open kitchen, one bedroom, and one bathroom."
    )
    definition = await call_llm(prompt, provider, endpoint, model_name, api_key, model_type)

    rooms_summary = ", ".join(
        f"{r.type} ({r.targetArea}m\u00b2)" for r in definition.rooms
    )
    msg = (
        f"Connected. {definition.buildingType}, {definition.style}, "
        f"{definition.totalSurfaceArea}m\u00b2, rooms: [{rooms_summary}]"
    )
    logger.info("[LLM] Connection test result: %s", msg)
    return {"status": "ok", "response": msg}


async def fetch_available_models(provider: str, endpoint: str) -> list[str]:
    base = _normalize_endpoint(endpoint)
    logger.info("[LLM] Fetching models | provider=%s base=%s", provider, base)

    if provider == "ollama":
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{base}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            return [m["name"] for m in data.get("models", [])]
    elif provider in ("nvidia", "openai", "lmstudio"):
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{base}/v1/models")
            resp.raise_for_status()
            data = resp.json()
            return [m["id"] for m in data.get("data", [])]
    else:
        raise ValueError(f"Unknown LLM provider: {provider}")


MOCK_RESPONSE = DesignDefinition(
    buildingType="apartment",
    totalSurfaceArea=90,
    style="scandinavian",
    rooms=[
        RoomSpec(id="living_room", type="living_room", targetArea=35, preferredConnections=["kitchen", "hallway"]),
        RoomSpec(id="bedroom_1", type="bedroom", targetArea=16, preferredConnections=["bathroom_1", "hallway"]),
        RoomSpec(id="kitchen_1", type="kitchen", targetArea=14, preferredConnections=["living_room"]),
        RoomSpec(id="bathroom_1", type="bathroom", targetArea=8, preferredConnections=["bedroom_1", "hallway"]),
        RoomSpec(id="hallway_1", type="hallway", targetArea=17, preferredConnections=[]),
    ]
)
