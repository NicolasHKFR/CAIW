"""
Packaging script for the CAIW backend.
Run: python package.py
This freezes the FastAPI backend into a standalone executable using PyInstaller
and copies it to the Tauri sidecar directory.
"""
import subprocess
import sys
import os
import shutil


def main():
    script_dir = os.path.dirname(__file__)
    venv_python = os.path.join(script_dir, "venv", "Scripts", "python.exe")
    if not os.path.exists(venv_python):
        venv_python = sys.executable

    cmd = [
        venv_python,
        "-m", "PyInstaller",
        "--onedir",
        "--name", "caiw-backend",
        "--clean",
        "--add-data", f"app{os.pathsep}app",
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "uvicorn.loops.auto",
        "--hidden-import", "uvicorn.protocols.http.auto",
        "run.py",
    ]

    print("Running PyInstaller...")
    subprocess.run(cmd, cwd=script_dir, check=True)

    dist_dir = os.path.join(script_dir, "dist", "caiw-backend")
    sidecar_dir = os.path.join(script_dir, "..", "src-tauri", "sidecars", "caiw-backend")

    if os.path.exists(sidecar_dir):
        print(f"Removing old sidecar at {sidecar_dir}")
        shutil.rmtree(sidecar_dir)

    print(f"Copying {dist_dir} → {sidecar_dir}")
    shutil.copytree(dist_dir, sidecar_dir)

    target_exe = os.path.join(sidecar_dir, "caiw-backend.exe")
    triple = _detect_target_triple()
    renamed = os.path.join(os.path.dirname(sidecar_dir), f"caiw-backend-{triple}.exe")
    if os.path.exists(sidecar_dir):
        print(f"Renaming {target_exe} → {renamed}")
        if os.path.isfile(target_exe):
            shutil.copy2(target_exe, renamed)
            print(f"Copied as {renamed}")

    print(f"\nDone! Backend executable is in {dist_dir}")
    print(f"Copied to Tauri sidecar: {sidecar_dir}")
    if os.path.exists(renamed):
        print(f"Also available at: {renamed}")


def _detect_target_triple() -> str:
    import platform
    machine = platform.machine().lower()
    if machine in ("amd64", "x86_64"):
        arch = "x86_64"
    elif machine in ("arm64", "aarch64"):
        arch = "aarch64"
    else:
        arch = "x86_64"
    system = platform.system().lower()
    if system == "windows":
        return f"{arch}-pc-windows-msvc"
    elif system == "darwin":
        return f"{arch}-apple-darwin"
    else:
        return f"{arch}-unknown-linux-gnu"


if __name__ == "__main__":
    main()
