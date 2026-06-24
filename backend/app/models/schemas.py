from datetime import datetime
from pydantic import BaseModel, Field


class FurnitureItem(BaseModel):
    id: str = ""
    name: str
    x: float = 0.0
    y: float = 0.0
    width: float = 1.0
    length: float = 1.0


class RoomSpec(BaseModel):
    id: str = ""
    type: str
    targetArea: float
    preferredConnections: list[str] = []
    x: float | None = None
    y: float | None = None
    w: float | None = None
    h: float | None = None
    furniture: list[FurnitureItem] = []
    floor: int = 1
    connectedFloor: int | None = None


class MaterialSuggestion(BaseModel):
    name: str
    description: str = ""
    estimatedCostPerM2: float = 0.0
    unit: str = "m²"


class BudgetBreakdown(BaseModel):
    totalEstimated: float = 0.0
    currency: str = "USD"
    items: list[dict] = []


class DesignDefinition(BaseModel):
    buildingType: str = "apartment"
    totalSurfaceArea: float = 90.0
    style: str = "scandinavian"
    aspectRatio: float | None = None
    rooms: list[RoomSpec] = []
    materials: list[MaterialSuggestion] = []
    estimatedBudget: BudgetBreakdown | None = None


class ProjectCreate(BaseModel):
    name: str
    original_prompt: str


class ProjectResponse(BaseModel):
    id: str
    name: str
    original_prompt: str
    created_at: datetime
    updated_at: datetime


class BulkDeleteRequest(BaseModel):
    project_ids: list[str]


class DesignResponse(BaseModel):
    id: str
    project_id: str
    version: int
    json_definition: dict
    rendering_image_path: str | None = None
    floor_plan_image_path: str | None = None
    created_at: datetime


class DesignUpdate(BaseModel):
    json_definition: DesignDefinition


class SettingsResponse(BaseModel):
    mock_mode: bool = True
    llm_provider: str = "nvidia"
    llm_endpoint: str = "http://localhost:11434"
    llm_model: str = "mistral"
    nvidia_api_key: str = ""
    nvidia_endpoint: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str = "moonshotai/kimi-k2.6"
    image_provider: str = "local_sd"
    image_endpoint: str = "http://localhost:7860"
    openai_api_key: str = ""
    replicate_api_key: str = ""
    sd_controlnet_model: str = "control_v11p_sd15_mlsd"
    sd_steps: int = 20
    sd_width: int = 640
    sd_height: int = 448


class WsChatRequest(BaseModel):
    project_id: str
    message: str


class WsProgress(BaseModel):
    event: str = "progress"
    status: str
    message: str


class WsComplete(BaseModel):
    event: str = "complete"
    design: dict
    message: str


class WsError(BaseModel):
    event: str = "error"
    message: str


class ChatMessageCreate(BaseModel):
    role: str = "user"
    content: str


class ChatMessageResponse(BaseModel):
    id: str
    project_id: str
    role: str
    content: str
    created_at: datetime


class FurnitureCatalogResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    id: str
    name: str
    default_width: float
    default_length: float
    typical_room_type: str
    image_path: str | None = None
    source_design_id: str | None = None
    source_prompt: str = ""
    created_at: datetime


class ModelCreate(BaseModel):
    model_config = {"protected_namespaces": ()}
    provider: str
    model_name: str
    endpoint: str
    api_key: str = ""
    model_type: str = "chat"


class ModelUpdate(BaseModel):
    model_config = {"protected_namespaces": ()}
    provider: str | None = None
    model_name: str | None = None
    endpoint: str | None = None
    api_key: str | None = None
    model_type: str | None = None


class ImportImageResponse(BaseModel):
    json_definition: DesignDefinition
    message: str = ""


class ModelResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    id: str
    provider: str
    model_name: str
    endpoint: str
    api_key: str
    model_type: str
    is_active: bool
    supports_vision: bool = False
    created_at: datetime
