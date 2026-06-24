# AGENTS.md — CAIW (AI Design Studio)

Local-first desktop app generating architectural floor plans from natural language prompts.

## Stack

- **Desktop shell:** Tauri (Rust) — manages Python backend as a sidecar process
- **Frontend:** React 18 + TypeScript + Vite + CSS Modules + Zustand
- **Backend:** Python 3 + FastAPI + SQLAlchemy async + aiosqlite + Pydantic v2
- **AI:** Ollama (local), NVIDIA API, OpenAI; Stable Diffusion WebUI (local), Replicate

## Key commands

```bash
# Backend dev server (from backend/)
cd backend
python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Backend tests (from backend/)
pytest

# Frontend dev server (from frontend/)
npm install && npm run dev

# Full-stack dev (anywhere, Windows only)
start.cmd

# Production build
npm run build   # (from frontend/) — runs tsc -b && vite build

# Package backend as Tauri sidecar (from backend/)
python package.py
```

## Testing

- `pytest` from `backend/` (pytest-asyncio, `asyncio_mode = auto`)
- Only backend tests exist — no frontend or Rust tests
- Test files: `backend/tests/test_api.py`, `backend/tests/test_solver.py`

## Architecture boundaries

| Directory | Role |
|-----------|------|
| `backend/app/main.py` | FastAPI app factory (dev) |
| `backend/run.py` | Argparse wrapper for uvicorn (Tauri sidecar entrypoint) |
| `frontend/src/main.tsx` | React entrypoint |
| `src-tauri/src/main.rs` | Tauri sidecar spawn + IPC commands |

**Communication:** Frontend ↔ Backend via HTTP REST + WebSocket (Vite proxy in dev, direct in prod). Tauri Rust ↔ Frontend via Tauri `invoke`. Tauri Rust manages backend process lifecycle.

## Non-obvious

- **Mock mode:** Set `MOCK_AI=True` in `backend/.env` to bypass all AI calls (returns pre-baked data). Essential for UI dev without GPU/LLM.
- **CSS Modules only** — no Tailwind. Custom properties in `frontend/src/styles/variables.css`.
- **No lint/format tooling installed** despite `developer_guide.md` mentioning Prettier/ESLint/black/flake8. Config files don't exist.
- **Backend startup race:** `start.cmd` uses `timeout /t 3`; frontend polls `/api/health` every 5s for readiness.
- **API key masking:** Keys display as `first6...last4` in responses. Keys containing `"****"` are treated as unchanged on update.
- **No `pyproject.toml`** — Python uses `requirements.txt` + `pytest.ini` only.
- **No frontend testing framework** configured (no Jest, Vitest, RTL).
- **State management:** 4 Zustand stores — `projectStore`, `chatStore`, `canvasStore`, `toastStore`.
