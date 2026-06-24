import logging
import logging.handlers
import os
import time
from pathlib import Path

from fastapi import FastAPI, Request


_LOG_CONFIGURED = False
_LOG_FILE_PATH: str | None = None


def _in_pytest() -> bool:
    return "PYTEST_CURRENT_TEST" in os.environ or "pytest" in os.environ.get("_", "")


def setup_logging(
    log_dir: str | None = None,
    level: str = "INFO",
    max_mb: int = 10,
    backup_count: int = 5,
    tauri_mode: bool = False,
) -> str:
    global _LOG_CONFIGURED, _LOG_FILE_PATH
    if _LOG_CONFIGURED:
        return _LOG_FILE_PATH or ""

    if log_dir is None:
        if tauri_mode:
            app_data = os.environ.get("APPDATA") or os.environ.get("HOME", "")
            log_dir = str(Path(app_data) / "caiw" / "logs")
        else:
            log_dir = str(Path(__file__).resolve().parents[3] / "logs")

    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    root = logging.getLogger()
    for h in list(root.handlers):
        root.removeHandler(h)

    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    fmt = logging.Formatter(
        "%(asctime)s — %(name)s — %(levelname)s — %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    brief_fmt = logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    if not _in_pytest():
        main_path = log_path / "caiw.log"
        main_handler = logging.handlers.RotatingFileHandler(
            main_path, maxBytes=max_mb * 1024 * 1024, backupCount=backup_count, encoding="utf-8",
        )
        main_handler.setLevel(logging.DEBUG)
        main_handler.setFormatter(fmt)
        root.addHandler(main_handler)

        err_path = log_path / "error.log"
        err_handler = logging.handlers.RotatingFileHandler(
            err_path, maxBytes=max_mb * 1024 * 1024, backupCount=backup_count, encoding="utf-8",
        )
        err_handler.setLevel(logging.ERROR)
        err_handler.setFormatter(fmt)
        root.addHandler(err_handler)

    console = logging.StreamHandler()
    console.setLevel(getattr(logging, level.upper(), logging.INFO))
    console.setFormatter(brief_fmt)
    root.addHandler(console)

    _LOG_CONFIGURED = True
    _LOG_FILE_PATH = str((log_path / "caiw.log").resolve()) if not _in_pytest() else ""

    if not _in_pytest():
        root.info("Logging initialised | file=%s level=%s max_mb=%d backups=%d", _LOG_FILE_PATH, level, max_mb, backup_count)
    return _LOG_FILE_PATH


def add_request_logging_middleware(app: FastAPI) -> None:
    req_logger = logging.getLogger("uvicorn")

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed = (time.perf_counter() - start) * 1000

        method = request.method
        path = request.url.path
        status = response.status_code

        if status >= 500:
            req_logger.error("  ← %s %s %d (%.0fms)", method, path, status, elapsed)
        elif status >= 400:
            req_logger.warning("  ← %s %s %d (%.0fms)", method, path, status, elapsed)
        else:
            req_logger.info("  ← %s %s %d (%.0fms)", method, path, status, elapsed)

        return response