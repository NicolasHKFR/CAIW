export interface FurnitureItem {
  id: string
  name: string
  x: number
  y: number
  width: number
  length: number
  shape?: string
}

export interface RoomSpec {
  id: string
  type: string
  targetArea: number
  preferredConnections: string[]
  x: number | null
  y: number | null
  w: number | null
  h: number | null
  furniture: FurnitureItem[]
  floor: number
  connectedFloor: number | null
}

export interface MaterialSuggestion {
  name: string
  description: string
  estimatedCostPerM2: number
  unit: string
}

export interface BudgetBreakdown {
  totalEstimated: number
  currency: string
  items: { category: string; amount: number }[]
}

export interface DesignDefinition {
  buildingType: string
  totalSurfaceArea: number
  style: string
  aspectRatio: number | null
  rooms: RoomSpec[]
  materials: MaterialSuggestion[]
  estimatedBudget: BudgetBreakdown | null
}

export interface FurnitureCatalogItem {
  id: string
  name: string
  default_width: number
  default_length: number
  typical_room_type: string
  image_path: string | null
  source_design_id: string | null
  source_prompt: string
  created_at: string
}

export interface Project {
  id: string
  name: string
  original_prompt: string
  created_at: string
  updated_at: string
}

export interface Design {
  id: string
  project_id: string
  version: number
  json_definition: DesignDefinition
  rendering_image_path: string | null
  floor_plan_image_path: string | null
  created_at: string
}

export interface WsProgress {
  event: 'progress'
  status: string
  message: string
}

export interface WsComplete {
  event: 'complete'
  design: {
    version: number
    json_definition: DesignDefinition
    rendering_image_path: string | null
    floor_plan_image_path: string | null
  }
  message: string
}

export interface WsError {
  event: 'error'
  message: string
}

export interface WsPing {
  event: 'ping'
}

export type WsMessage = WsProgress | WsComplete | WsError | WsPing

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  design?: WsComplete['design']
  status?: string
}

export interface ChatMessageDB {
  id: string
  project_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface AppSettings {
  mock_mode: boolean
  llm_provider: string
  llm_endpoint: string
  llm_model: string
  nvidia_api_key: string
  nvidia_endpoint: string
  nvidia_model: string
  openrouter_api_key: string
  openrouter_endpoint: string
  openrouter_model: string
  image_endpoint: string
}

export interface ModelItem {
  id: string
  provider: string
  model_name: string
  endpoint: string
  api_key: string
  model_type: string
  is_active: boolean
  supports_vision: boolean
  created_at: string
}

export interface ModelCreatePayload {
  provider: string
  model_name: string
  endpoint: string
  api_key?: string
  model_type?: string
}

export interface FurnitureGenerateRequest {
  name: string
  typical_room_type: string
  default_width: number
  default_length: number
  style: string
  sd_model: string
}

export interface ScoreBreakdown {
  overall: number
  grade: string
  space_efficiency: number
  circulation: number
  natural_light: number
  proportions: number
  furniture_fit: number
  warnings: string[]
}

export interface RoomSunlight {
  id: string
  sunlight_hours: number
  annual_kwh: number
  orientation: string
}

export interface SunlightData {
  rooms: RoomSunlight[]
  orientation_optimal: number
  energy_estimate: { heating_kwh: number; cooling_kwh: number }
}

export interface EvolutionEntry {
  version: number
  timestamp: string
  rooms_added: string[]
  rooms_removed: string[]
  area_change: number
}

export interface IntelligenceResponse {
  score: ScoreBreakdown
  sunlight: SunlightData
}
