@echo off
chcp 65001 >nul
title CAIW - AI Design Studio

echo ========================================
echo   CAIW - AI Design Studio Dev Launcher
echo ========================================
echo.

REM --- Check backend venv ---
if not exist "backend\venv\Scripts\activate.bat" (
    echo [1/3] Creating Python virtual environment...
    cd backend
    python -m venv venv
    if %errorlevel% neq 0 (
        echo ERROR: Failed to create virtual environment. Make sure Python 3 is installed.
        pause
        exit /b 1
    )
    cd ..
) else (
    echo [1/3] Virtual environment found.
)

REM --- Install backend deps if needed ---
if not exist "backend\venv\Lib\site-packages\fastapi" (
    echo [2/3] Installing backend dependencies...
    cd backend
    call venv\Scripts\activate.bat && pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo ERROR: pip install failed.
        pause
        exit /b 1
    )
    cd ..
) else (
    echo [2/3] Backend dependencies found.
)

REM --- Install frontend deps if needed ---
if not exist "frontend\node_modules" (
    echo [3/3] Installing frontend dependencies...
    cd frontend
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
    cd ..
) else (
    echo [3/3] Frontend dependencies found.
)

echo.
echo ========================================
echo   Starting servers...
echo ========================================
echo.

REM Kill any leftover processes on our ports
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8188 ^| findstr LISTENING') do (
    taskkill /F /PID %%a 2>nul
)

REM Start ComfyUI
set COMFY_DIR=%CD%\ComfyUI
if exist "%COMFY_DIR%\main.py" (
    REM Quick CUDA check
    echo Checking CUDA...
    "%COMFY_DIR%\venv\Scripts\python.exe" -c "import torch; print('CUDA:', torch.cuda.is_available())" 2>nul | findstr "True" >nul
    if %errorlevel% neq 0 (
        echo WARNING: CUDA not detected in ComfyUI venv.
        echo If ComfyUI fails to start, recreate its venv:
        echo    rmdir /s "%COMFY_DIR%\venv"
        echo    python -m venv "%COMFY_DIR%\venv" --system-site-packages
        echo    "%COMFY_DIR%\venv\Scripts\pip" install -r "%COMFY_DIR%\requirements.txt"
    )
    echo Starting ComfyUI from %COMFY_DIR%...
    start "ComfyUI" cmd /c "cd /d %COMFY_DIR% && title ComfyUI && .\venv\Scripts\python.exe main.py --listen --port 8188"
    echo ComfyUI starting on http://localhost:8188
    echo (It may take 30-60s to be ready on first start)
) else (
    echo ComfyUI not found at %COMFY_DIR% -- skipping.
)

REM Start backend in its own window
start "CAIW Backend" cmd /c "cd /d %CD%\backend && call venv\Scripts\activate.bat && title CAIW Backend && uvicorn app.main:app --reload --port 8000 --log-level info"

REM Wait a moment for backend to initialize
timeout /t 3 /nobreak >nul

REM Start frontend in its own window
start "CAIW Frontend" cmd /c "cd /d %CD%\frontend && title CAIW Frontend && npm run dev"

echo.
echo  Backend    ^> http://localhost:8000
echo  Frontend   ^> http://localhost:5173
echo  API Docs   ^> http://localhost:8000/docs
echo  ComfyUI    ^> http://localhost:8188
echo.
echo Close this window to leave servers running,
echo or close each server window individually.
echo.
pause
