# Developer Workflow Guide: AI Design Studio (CAIW)

This document defines the standard operating procedures, coding guidelines, local environment setup, and development workflows that **all developers must follow** throughout the lifecycle of this project.

---

## 1. Project Directory Structure

We adhere to a monorepo structure separating the desktop shell, web frontend, and Python backend:

```text
DZAIner/
├── src-tauri/                 # Tauri Core (Rust Desktop Shell)
│   ├── src/
│   │   ├── main.rs            # Desktop application entry point & sidecar manager
│   │   └── commands.rs        # Tauri IPC commands exposed to React
│   ├── tauri.conf.json        # Tauri build & sidecar definitions
│   └── Cargo.toml             # Rust dependencies
├── frontend/                  # Web Client (React + TypeScript)
│   ├── src/
│   │   ├── components/        # Reusable UI elements (chat, settings, canvas)
│   │   ├── hooks/             # Custom React hooks
│   │   ├── store/             # Zustand state management
│   │   ├── styles/            # CSS Modules & design system variables
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── tsconfig.json
├── backend/                   # Python Backend Services (FastAPI)
│   ├── app/
│   │   ├── api/               # API Router endpoints
│   │   ├── core/              # Config, local DB session, security
│   │   ├── models/            # SQLAlchemy / SQLModel definitions
│   │   ├── solver/            # Procedural layout constraint solver
│   │   ├── services/          # AI Orchestrator, Ollama/SD connectors
│   │   └── main.py            # FastAPI entry point
│   ├── tests/                 # Backend unit & integration tests
│   ├── requirements.txt       # Python dependencies
│   └── run.py                 # Entry point script used by Tauri Sidecar
├── docs/                      # General documentation
│   ├── architecture_documentation.md
│   └── developer_guide.md     # This document
└── README.md
```

---

## 2. Setting Up the Local Development Environment

To run the application locally in development mode (with hot-reloading on both frontend and backend), follow these setup steps:

### Prerequisite 1: Python Backend Setup
1. Navigate to `/backend` and create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Start the FastAPI server manually for dev mode (running on port `8000` with hot reload):
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

### Prerequisite 2: Frontend Setup
1. Navigate to `/frontend` and install Node dependencies:
   ```bash
   npm install
   ```
2. Start the Vite development server:
   ```bash
   npm run dev
   ```

### Prerequisite 3: Running Tauri Dev Shell
1. Ensure Rust and the Tauri CLI are installed.
2. In the root directory, run the Tauri development wrapper:
   ```bash
   npm run tauri dev
   ```
   *Note: In dev mode, Tauri points to Vite's local dev server (typically `http://localhost:5173`) and connects to your manually running FastAPI instance (`http://localhost:8000`). In production builds, Tauri bundles the frontend assets and packages the backend as a sidecar.*

---

## 3. Developer Workflow & Coding Standards

To maintain a clean codebase, every developer must follow these rules:

### A. Frontend (React + TypeScript + Vanilla CSS)
- **Modularity:** Keep components small, reusable, and single-purpose. Large UI views (like the Chat window or Layout Canvas) should be broken down into child components.
- **Strict Typing:** Avoid `any`. Define Interfaces/Types for all API payloads and component properties.
- **Styling Rules (CSS Modules):**
  - Do NOT use TailwindCSS. Use CSS Modules (`*.module.css`) to prevent class collisions.
  - Define global variables (colors, spacing, typography) in `/frontend/src/styles/variables.css` and use them via `var(--color-primary)`.
  - Always implement hover states, active states, and transition animations for interactive items.
- **State Management:** Keep React component state local unless it needs to be shared globally (e.g., active project ID, chat messages log). Share global state using **Zustand** stores in `/frontend/src/store/`.

### B. Backend (Python + FastAPI)
- **Async Code:** Write async path operations (`async def`) for all database operations, network API calls, and external model queries to prevent blocking the event loop.
- **Data Validation:** Use **Pydantic v2** models to validate all incoming client payloads and outgoing API responses.
- **Database Rules:** Use SQLAlchemy/SQLModel async sessions. Do not execute raw SQL queries; use the ORM structure to protect against injection and ensure SQLite compatibility.
- **Logging:** Use Python's standard `logging` module. Do not use `print()` statements in production code.

### C. Tauri Desktop Shell (Rust)
- **Error Handling:** Tauri commands (Rust functions) called by the frontend must return `Result<T, E>` where `E` is a serialized error string. Avoid calling `.unwrap()` or `.expect()` which can cause the entire desktop app to crash.
- **Command Registration:** All new Rust command functions must be registered in the `tauri::Builder` invoke handler in `main.rs`.

---

## 4. Local AI Environment Setup (Mandatory for Developers)

To run the AI pipeline locally during development, you must configure the following dependencies:

### Local LLM (Ollama)
1. Download and install [Ollama](https://ollama.com/).
2. Pull the default development model (Mistral or Llama3):
   ```bash
   ollama pull mistral
   ```
3. Ensure the Ollama service is running on `http://localhost:11434`.

### Local Image Generator (Stable Diffusion)
1. Install [Stable Diffusion WebUI (AUTOMATIC1111)](https://github.com/AUTOMATIC1111/stable-diffusion-webui).
2. Download a base model (e.g. Stable Diffusion v1.5 or SDXL) and place it in the `models/Stable-diffusion` directory.
3. Start the WebUI with the API enabled:
   ```bash
   webui.bat --api --cors-origins http://localhost:11434,http://localhost:5173
   ```
4. Verify the API is accessible at `http://localhost:7860/docs`.

### Mock Mode (For Local Machine Testing without GPUs)
When working on UI or logic changes where you don't need active AI outputs:
- Set `MOCK_AI=True` in the backend `.env` file.
- The Orchestrator will automatically return pre-baked mock layouts and placeholder interior design images, avoiding GPU overhead and external API costs.

---

## 5. Branch Management & Definition of Done (DoD)

### Git Branching Strategy
- `main`: Production-ready code only. Do not commit directly to `main`.
- `dev`: Integration branch for stable development.
- Feature branches: Created from `dev` as `feature/description` (e.g., `feature/canvas-drag-drop`). Merge back to `dev` via Pull Request.

### Definition of Done (DoD) Checklist
Before any code change is merged, it must satisfy the following checklist:

- [ ] **Tests Pass:** All backend tests (`pytest` in `/backend`) and frontend tests pass.
- [ ] **Linting & Formatting:** 
  - Frontend code is formatted using Prettier/ESLint.
  - Python code is formatted with `black` and linted with `flake8`.
- [ ] **No Credentials Committed:** Verify no API keys, paths, or secrets are hardcoded in the source files.
- [ ] **Schema Migration Updated:** If SQLite database tables are added or modified, the developer has created the appropriate SQL script / migration task.
- [ ] **Verification:** Manual end-to-end verification (e.g. generating a design, saving, reloading) succeeds on Windows.
- [ ] **Documentation:** Any changes to APIs, configuration schemas, or user features are documented in `/docs` and the API Swagger docs (`http://localhost:8000/docs`) are updated.
