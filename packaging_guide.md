# Tauri & Python Sidecar Packaging Guide

This guide explains how to compile the Python FastAPI backend into a standalone binary and package it as a sidecar inside the Tauri desktop application. This process ensures the user can run the application offline with no Python installation required on their machine.

---

## 1. How Tauri Sidecars Work

Tauri allows executing external binaries called **sidecars**. 
- The Tauri Rust core manages spawning, communicating with, and terminating these sidecars.
- To prevent path conflicts and platform mismatches, Tauri requires sidecar binaries to follow a specific naming convention: `<binary-name>-<target-triple>`.
- For example, on a 64-bit Windows machine, the sidecar binary for `caiw-backend` must be named `caiw-backend-x86_64-pc-windows-msvc.exe`.

---

## 2. Compiling the Python Backend with PyInstaller

We use `PyInstaller` to freeze the FastAPI app and all its dependencies (including SQLite, Uvicorn, and Pydantic) into a single, self-contained executable.

### Step-by-Step Compilation Process:
1. Navigate to `/backend` and activate your virtual environment:
   ```bash
   cd backend
   .\venv\Scripts\activate
   ```
2. Install PyInstaller:
   ```bash
   pip install pyinstaller
   ```
3. Run the PyInstaller command to freeze `run.py` (the entry point script that starts the Uvicorn/FastAPI server):
   ```bash
   pyinstaller --onedir --name caiw-backend --clean run.py
   ```
   *Note: Using `--onedir` (one folder) is highly recommended over `--onefile` for performance, as `--onefile` unpacks the executable into a temporary directory on every single launch, which delays application startup.*

4. Locate the compiled files in `backend/dist/caiw-backend/`.

---

## 3. Integrating the Sidecar into Tauri

### Step 1: Copy to Tauri Sidecars Folder
1. Create a `sidecars` directory inside `src-tauri/` if it does not exist.
2. Copy the entire contents of the compiled folder `backend/dist/caiw-backend/` into `src-tauri/sidecars/caiw-backend/`.
3. Locate the main executable inside that folder (`caiw-backend.exe`) and copy it directly to `src-tauri/sidecars/`.
4. Rename `src-tauri/sidecars/caiw-backend.exe` to match the target triple.
   - On Windows: `caiw-backend-x86_64-pc-windows-msvc.exe`
   - On macOS (Intel): `caiw-backend-x86_64-apple-darwin`
   - On macOS (Apple Silicon): `caiw-backend-aarch64-apple-darwin`

### Step 2: Configure `tauri.conf.json`
Add the sidecar configuration under the `bundle` object in `src-tauri/tauri.conf.json`:

```json
{
  "tauri": {
    "bundle": {
      "active": true,
      "targets": "all",
      "sidecars": [
        "sidecars/caiw-backend"
      ]
    },
    "allowlist": {
      "shell": {
        "sidecar": true,
        "scope": [
          { "name": "sidecars/caiw-backend", "sidecar": true }
        ]
      }
    }
  }
}
```

---

## 4. Spawning the Sidecar in Rust (`main.rs`)

The Tauri Rust core needs to spawn the sidecar on startup. Uvicorn needs to be assigned a dynamically probed free port to avoid collisions.

```rust
use tauri::api::process::{Command, CommandEvent};
use std::sync::Mutex;

struct PortState(Mutex<u16>);

fn main() {
    // 1. Find a free port locally
    let port = portpicker::pick_unused_port().expect("No free ports available");

    tauri::Builder::default()
        .manage(PortState(Mutex::new(port)))
        .setup(move |app| {
            // 2. Spawn the FastAPI sidecar binary
            let (mut rx, child) = Command::new_sidecar("caiw-backend")
                .expect("Failed to create sidecar command")
                .args([
                    "--port", &port.to_string(),
                    "--db-path", "./database.db",
                    "--assets-path", "./assets"
                ])
                .spawn()
                .expect("Failed to spawn sidecar");

            // 3. Monitor events / keep reference to kill on exit
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stdout(line) = event {
                        println!("Backend stdout: {}", line);
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 5. Development vs. Production Configurations

| Mode | Communication | Process Lifecycle |
| :--- | :--- | :--- |
| **Development** | Frontend requests `localhost:8000`. | FastAPI is run manually via `uvicorn app.main:app --reload`. |
| **Production** | Rust core informs Frontend of the dynamically picked port. Frontend makes requests to `localhost:<picked-port>`. | Tauri Rust core automatically spawns the compiled `caiw-backend` sidecar on start and kills it on exit. |

---

## 6. Common Issues & Troubleshooting

1. **Missing DLLs or Python libraries on run:**
   - Ensure that any dynamic C library dependencies used by Python packages (e.g. `sqlite3.dll`) are placed in the same directory as the executable. PyInstaller usually handles this, but double check if run fails.
2. **Path Resolution Errors:**
   - In compiled sidecar mode, paths using `__file__` inside Python resolve to PyInstaller's temporary directories or the installation directory. Use standard environment variables or explicit path arguments passed from Rust to locate folders.
3. **Firewall Alerts:**
   - On Windows, binding to `0.0.0.0` triggers a system firewall alert. Always bind the local FastAPI server to `127.0.0.1` (`localhost`) to prevent security popups.
