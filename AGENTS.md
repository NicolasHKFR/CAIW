# AGENTS.md — CAIW (AI Design Studio)

Local-first desktop app (Tauri/Rust + React + Python/FastAPI) that generates
architectural floor plans from natural language prompts.

## Stack

- **Desktop shell:** Tauri (Rust) — manages Python backend as a sidecar process
- **Frontend:** React 18 + TypeScript + Vite + CSS Modules + Zustand (5 stores)
- **Backend:** Python 3.11+ + FastAPI + SQLAlchemy async + aiosqlite + Pydantic v2
- **AI providers:** Ollama, NVIDIA (nvapi), OpenRouter, LM Studio, ComfyUI (in-repo)

## Key commands

```bash
# Backend (from backend/)
python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Backend tests
pytest          # 59 tests, asyncio_mode=auto

# Frontend (from frontend/)
npm install && npm run dev       # dev server (port 5173)
npm run build                    # tsc -b && vite build (production)
npm run test                     # vitest (3 tests, jsdom)
npm run lint                     # eslint
npm run format                   # prettier

# Full-stack dev (Windows)
start.cmd       # kills orphaned ports, launches ComfyUI + backend + frontend
```

## Architecture

| Directory | Role |
|-----------|------|
| `backend/app/main.py` | FastAPI app factory (registers 11 routers) |
| `backend/run.py` | Argparse uvicorn wrapper (Tauri sidecar entrypoint) |
| `backend/app/api/` | 11 route modules: projects, designs, models, settings, ws, catalog, messages, export, import, intelligence |
| `backend/app/services/` | 5 services: llm, image, comfy, orchestrator, intelligence |
| `backend/app/solver/` | Layout solver (slicing tree, hallway detection, door placement) |
| `frontend/src/main.tsx` | React entrypoint |
| `frontend/src/store/` | 5 Zustand stores: project, chat, canvas, scene, toast |
| `src-tauri/src/main.rs` | Tauri sidecar spawn + health-check restart loop |

**Communication:** Frontend ↔ Backend via HTTP REST + WebSocket (Vite proxy in dev, direct in prod). Tauri ↔ Frontend via `invoke`. Tauri manages backend process lifecycle.

## LLM provider routing (`llm_service.py`)

- `call_llm()` routes: `ollama` → `_call_ollama`, `nvidia`/`openai`/`lmstudio`/`openrouter` → `_call_openai`
- `_call_openai` has 3 retries, httpx timeout **300s** for OpenRouter free-tier queueing
- `model_type="reasoning"` sends `payload["reasoning"] = {"enabled": True}` (OpenRouter only) and strips `<think>` tags from response
- `model_type="tools"` sends tool_choice payload on attempt 0, falls back to JSON-in-content on retries
- `reasoning_details` from OpenRouter response is captured and passed back on retry messages
- `_call_openai_vision` always sends `tools` payload (uses tool_choice, different from chat)

## Coordinate system

Key convention: solver `(x, y)` = top-left corner of room.

```
Solver coords (top-left origin, Y-down)
  ├── 2D Canvas:  x' = x * SCALE + panX    y' = y * SCALE + panY
  └── 3D / VR:    worldX = (x + w/2) - cx    worldZ = -((y + h/2) - cy)
```

- `frontend/src/constants.ts`: `SCALE=30`, `GRID_SIZE=0.5`, `WALL_HEIGHT=2.5`
- `frontend/src/utils/coordinates.ts`: `centerOf()`, `toWorldX()`, `toWorldZ()`, etc.
- Furniture `f.x, f.y` relative to room top-left `(room.x, room.y)`

## @react-three/xr v6.6.30

- `createXRStore({ controller: { teleportPointer: true } })` — store with built-in teleport
- `<XR store={store}>` — requires `store` prop (v5 style removed)
- `useXRInputSourceState('controller', handedness)` replaces `useController()`
- `useXRInputSourceEvent(inputSource, eventName, fn, deps)` replaces `useXREvent()`
- `<TeleportTarget onTeleport={setPosition}>` + `<XROrigin position={pos}>` — no manual raycasting
- `<NotInXR>` — wraps children so hooks don't throw outside VR
- `enterVR()` / `enterAR()` return Promise — always `.catch()`

## Testing

- **Backend:** `pytest` from `backend/` (59 tests, pytest-asyncio, conftest.py calls init_db)
- **Frontend:** `npx vitest run` from `frontend/` (3 tests, jsdom, setup.ts imports jest-dom)
- **No Rust tests** configured

## Key gotchas

- **Mock mode:** `MOCK_AI=True` in `backend/.env` returns pre-baked data (essential for UI dev)
- **CSS Modules only** — no Tailwind. Custom properties in `frontend/src/styles/variables.css`.
- **Backend startup race:** `start.cmd` uses `timeout /t 3`; frontend polls `/api/health` every 5s
- **API key masking:** Keys display as `first6...last4`; keys `"****"` treated as unchanged on update
- **No `pyproject.toml`** — Python uses `requirements.txt` + `pytest.ini` only
- **OpenRouter free tier:** ~20 req/day without credits; router picks random from 24 free models
- **Lint/format exist** but no CI enforces them — `npm run lint`, `npm run format`
- **ComfyUI** lives in-repo at `ComfyUI/` (full fork), launched by `start.cmd` on port 8188
- **`.env` is NOT in `.gitignore` for `backend/`** — only root `.env` is gitignored (via root `.gitignore`)
