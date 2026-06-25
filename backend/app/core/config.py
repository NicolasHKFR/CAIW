import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _default_comfy_input() -> str:
    env = os.getenv("COMFY_INPUT_DIR")
    if env:
        return env
    repo_root = Path(__file__).resolve().parent.parent.parent.parent
    return str(repo_root / "ComfyUI" / "input")


@dataclass
class Settings:
    mock_ai: bool = os.getenv("MOCK_AI", "True").lower() == "true"
    llm_provider: str = os.getenv("LLM_PROVIDER", "openrouter")
    llm_endpoint: str = os.getenv("LLM_ENDPOINT", "https://openrouter.ai/api/v1")
    llm_model: str = os.getenv("LLM_MODEL", "openrouter/free")
    nvidia_api_key: str = os.getenv("NVIDIA_API_KEY", "")
    nvidia_endpoint: str = os.getenv("NVIDIA_ENDPOINT", "https://integrate.api.nvidia.com/v1")
    nvidia_model: str = os.getenv("NVIDIA_MODEL", "moonshotai/kimi-k2.6")
    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
    openrouter_endpoint: str = os.getenv("OPENROUTER_ENDPOINT", "https://openrouter.ai/api/v1")
    openrouter_model: str = os.getenv("OPENROUTER_MODEL", "openrouter/free")
    image_endpoint: str = os.getenv("IMAGE_ENDPOINT", "http://localhost:8188")
    database_path: str = os.getenv("DATABASE_PATH", "./data/caiw.db")
    assets_path: str = os.getenv("ASSETS_PATH", "./assets")
    cors_origins: list[str] = field(default_factory=lambda: ["*"])
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    sd_width: int = int(os.getenv("SD_WIDTH", "640"))
    sd_height: int = int(os.getenv("SD_HEIGHT", "448"))
    sd_steps: int = int(os.getenv("SD_STEPS", "20"))
    sd_controlnet_model: str = os.getenv("SD_CONTROLNET_MODEL", "")
    comfy_input_dir: str = field(default_factory=_default_comfy_input)
    log_dir: str = os.getenv("LOG_DIR", "")
    log_max_mb: int = int(os.getenv("LOG_MAX_MB", "10"))
    log_backup_count: int = int(os.getenv("LOG_BACKUP_COUNT", "5"))

    @property
    def db_url(self) -> str:
        db_path = Path(self.database_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite+aiosqlite:///{db_path.resolve()}"

    def apply_api_settings(self, data: dict) -> None:
        field_map = {
            "mock_mode": "mock_ai",
            "llm_provider": "llm_provider",
            "llm_endpoint": "llm_endpoint",
            "llm_model": "llm_model",
            "nvidia_api_key": "nvidia_api_key",
            "nvidia_endpoint": "nvidia_endpoint",
            "nvidia_model": "nvidia_model",
            "openrouter_api_key": "openrouter_api_key",
            "openrouter_endpoint": "openrouter_endpoint",
            "openrouter_model": "openrouter_model",
            "image_endpoint": "image_endpoint",
            "sd_width": "sd_width",
            "sd_height": "sd_height",
            "sd_steps": "sd_steps",
            "sd_controlnet_model": "sd_controlnet_model",
        }
        for api_key, attr_name in field_map.items():
            if api_key in data and hasattr(self, attr_name):
                setattr(self, attr_name, data[api_key])


settings = Settings()
