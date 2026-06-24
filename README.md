# AI Design Studio (CAIW) — Workspace Documentation Index

Welcome to the development workspace for **AI Design Studio (CAIW)**. This workspace contains the project specifications, solution architecture, and developer workflow guidelines designed to help the team build the MVP from start to finish.

This README serves as an index and map of all the planning documents we have created.

---

## 📂 The Documentation Directory Map

We have written five core design and workflow documents in this directory to serve as the absolute source of truth. Here is what each file contains and when to reference it:

### 1. 🏗️ [architecture_documentation.md](file:///d:/allai/DZAIner/architecture_documentation.md)
* **What it is:** The system design and solution architecture blueprint.
* **Key Contents:**
  - High-level block diagrams mapping the Tauri client, Rust core, FastAPI backend, and local/cloud AI services.
  - The process lifecycle (how Tauri spawns/kills the backend).
  - The SQLite database schema for local project saving and version histories.
  - The two-pass execution sequence mapping prompts to JSON parameters, constraints validation, and image rendering.

### 2. 🔌 [api_spec.md](file:///d:/allai/DZAIner/api_spec.md)
* **What it is:** The API endpoint specs and communication contract.
* **Key Contents:**
  - REST API endpoint specifications for project management (CRUD), designs, and local settings.
  - The JSON schema validation schemas.
  - The **WebSocket protocol specifications** used for streaming real-time AI progress updates (`parsing` ➔ `solving` ➔ `rendering` ➔ `complete` / `error`).

### 3. 📐 [algorithmic_and_ui_spec.md](file:///d:/allai/DZAIner/algorithmic_and_ui_spec.md)
* **What it is:** Algorithmic logic and UI interaction math.
* **Key Contents:**
  - **Slicing Tree Solver:** The mathematical algorithm for partitioning room areas within the floor footprint without overlaps.
  - **Canvas Conversion Equations:** Equations mapping real-world meters to screen pixels, including pan, zoom, and grid-snapping offsets.
  - **Stable Diffusion Payload:** The exact request body and ControlNet configuration (using `mlsd` lines) to convert floor plans to 3D interior renderings.
  - **Pre-baked JSON Mock Dataset:** Copy-pasteable mock database output for testing the Canvas UI without running AI.

### 4. 📦 [packaging_guide.md](file:///d:/allai/DZAIner/packaging_guide.md)
* **What it is:** Compilation and sidecar integration playbook.
* **Key Contents:**
  - Instructions on using `PyInstaller` to freeze the FastAPI backend into a single executable folder.
  - Tauri packaging details (renaming executables to target triples, e.g., `x86_64-pc-windows-msvc`).
  - The Rust code needed in `src-tauri/src/main.rs` to dynamically pick ports and orchestrate backend lifecycles.

### 5. 🛠️ [developer_guide.md](file:///d:/allai/DZAIner/developer_guide.md)
* **What it is:** General project guidelines and monorepo workflows.
* **Key Contents:**
  - The folder structure (`/frontend`, `/backend`, `/src-tauri`).
  - How to start local dev environments with hot-reloading enabled.
  - Setting up local Ollama (Mistral) and local Stable Diffusion WebUI.
  - Coding style rules (strict TypeScript, CSS Modules, Python async routes, Rust error safety).
  - Git branching rules and the **Definition of Done (DoD)** checklist.

---

## 🚀 How to Begin Development

For the development team starting in the room, follow this order to launch the workspace:
1. **Read the Index:** Start by reading this [README.md](file:///d:/allai/DZAIner/README.md) to understand the files.
2. **Review the Architectural Goal:** Check [architecture_documentation.md](file:///d:/allai/DZAIner/architecture_documentation.md) to see how the local components link together.
3. **Configure Local AI tools:** Follow the setup guide in [developer_guide.md](file:///d:/allai/DZAIner/developer_guide.md) to pull Ollama models and install Stable Diffusion WebUI.
4. **Setup Monorepo Directories:** Create the folder structure specified in the developer guide.
5. **Start Dev Server:** Initialize the dev environments and start building using the mock data provided in [algorithmic_and_ui_spec.md](file:///d:/allai/DZAIner/algorithmic_and_ui_spec.md).
