import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass
class Settings:
    mock_ai: bool = os.getenv("MOCK_AI", "True").lower() == "true"
    llm_provider: str = os.getenv("LLM_PROVIDER", "nvidia")
    llm_endpoint: str = os.getenv("LLM_ENDPOINT", "http://localhost:11434")
    llm_model: str = os.getenv("LLM_MODEL", "mistral")
    nvidia_api_key: str = os.getenv("NVIDIA_API_KEY", "")
    nvidia_endpoint: str = os.getenv("NVIDIA_ENDPOINT", "https://integrate.api.nvidia.com/v1")
    nvidia_model: str = os.getenv("NVIDIA_MODEL", "moonshotai/kimi-k2.6")
    image_provider: str = os.getenv("IMAGE_PROVIDER", "local_sd")
    image_endpoint: str = os.getenv("IMAGE_ENDPOINT", "http://localhost:8188")
    sd_controlnet_model: str = os.getenv("SD_CONTROLNET_MODEL", "control_v11p_sd15_mlsd")
    sd_steps: int = int(os.getenv("SD_STEPS", "20"))
    sd_width: int = int(os.getenv("SD_WIDTH", "640"))
    sd_height: int = int(os.getenv("SD_HEIGHT", "448"))
    database_path: str = os.getenv("DATABASE_PATH", "./data/caiw.db")
    assets_path: str = os.getenv("ASSETS_PATH", "./assets")
    cors_origins: list[str] = field(default_factory=lambda: ["*"])
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
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
            "image_provider": "image_provider",
            "image_endpoint": "image_endpoint",
            "sd_controlnet_model": "sd_controlnet_model",
            "sd_steps": "sd_steps",
            "sd_width": "sd_width",
            "sd_height": "sd_height",
        }
        for api_key, attr_name in field_map.items():
            if api_key in data and hasattr(self, attr_name):
                setattr(self, attr_name, data[api_key])


settings = Settings()
