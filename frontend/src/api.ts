import type { Project, Design, DesignDefinition, WsMessage, AppSettings, ModelItem, ModelCreatePayload, FurnitureCatalogItem, ChatMessageDB, FurnitureGenerateRequest, IntelligenceResponse, EvolutionEntry } from './types'

const BASE = ''
export const API_BASE = BASE

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  health: () => request<{ status: string; mock_ai: boolean; comfy_connected: boolean }>('/api/health'),

  listProjects: () => request<Project[]>('/api/projects'),
  createProject: (name: string, prompt: string) =>
    request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, original_prompt: prompt }),
    }),
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),
  deleteProject: (id: string) =>
    request<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  bulkDeleteProjects: (projectIds: string[]) =>
    request<{ deleted_count: number; deleted_ids: string[] }>('/api/projects/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ project_ids: projectIds }),
    }),

  listDesigns: (projectId: string) =>
    request<Design[]>(`/api/projects/${projectId}/designs`),
  getDesign: (projectId: string, version: number) =>
    request<Design>(`/api/projects/${projectId}/designs/${version}`),
  updateDesign: (projectId: string, version: number, def: DesignDefinition) =>
    request<Design>(`/api/projects/${projectId}/designs/${version}`, {
      method: 'PUT',
      body: JSON.stringify({ json_definition: def }),
    }),
  resolveDesign: (projectId: string, version: number, def: DesignDefinition) =>
    request<Design>(`/api/projects/${projectId}/designs/${version}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ json_definition: def }),
    }),

  getSettings: () => request<AppSettings>('/api/settings'),
  updateSettings: (s: AppSettings) =>
    request<AppSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(s),
    }),

  listModels: () => request<ModelItem[]>('/api/models'),
  createModel: (m: ModelCreatePayload) =>
    request<ModelItem>('/api/models', {
      method: 'POST',
      body: JSON.stringify(m),
    }),
  updateModel: (id: string, m: Partial<ModelItem>) =>
    request<ModelItem>(`/api/models/${id}`, {
      method: 'PUT',
      body: JSON.stringify(m),
    }),
  deleteModel: (id: string) =>
    request<void>(`/api/models/${id}`, { method: 'DELETE' }),
  activateModel: (id: string) =>
    request<ModelItem>(`/api/models/${id}/activate`, { method: 'PUT' }),
  testModel: (id: string) =>
    request<{ status: string; response: string }>(`/api/models/${id}/test`, { method: 'PUT' }),

  getSystemPrompt: () => request<{ prompt: string }>('/api/settings/system-prompt'),

  discoverModels: (provider: string, endpoint: string) =>
    request<string[]>(`/api/models/discover?provider=${encodeURIComponent(provider)}&endpoint=${encodeURIComponent(endpoint)}`),

  listMessages: (projectId: string) =>
    request<ChatMessageDB[]>(`/api/projects/${projectId}/messages`),
  createMessage: (projectId: string, role: string, content: string) =>
    request<ChatMessageDB>(`/api/projects/${projectId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ role, content }),
    }),

  getIntelligence: (projectId: string, version: number, lat?: number, lon?: number) =>
    request<IntelligenceResponse>(`/api/designs/${projectId}/${version}/intelligence${lat != null ? `?lat=${lat}&lon=${lon ?? -74.0}` : ''}`),

  getEvolution: (projectId: string) =>
    request<EvolutionEntry[]>(`/api/designs/${projectId}/evolution`),

  getIntelligenceReport: (projectId: string, version: number) =>
    `${API_BASE}/api/designs/${projectId}/${version}/intelligence/report`,

  exportPdf: (projectId: string, version: number) =>
    `${API_BASE}/api/export/projects/${projectId}/versions/${version}/pdf`,

  createCatalogItem: (item: { name: string; default_width: number; default_length: number; typical_room_type: string; image_path?: string; source_prompt?: string }) =>
    request<FurnitureCatalogItem>('/api/catalog', {
      method: 'POST',
      body: JSON.stringify(item),
    }),

  listCatalog: (params?: { q?: string; room_type?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.q) qs.set('q', params.q)
    if (params?.room_type) qs.set('room_type', params.room_type)
    if (params?.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return request<FurnitureCatalogItem[]>(`/api/catalog${query ? '?' + query : ''}`)
  },
  getCatalogItem: (id: string) =>
    request<FurnitureCatalogItem>(`/api/catalog/${id}`),
  deleteCatalogItem: (id: string) =>
    request<void>(`/api/catalog/${id}`, { method: 'DELETE' }),
  bulkDeleteCatalogItems: (itemIds: string[]) =>
    request<{ deleted_count: number; deleted_ids: string[] }>('/api/catalog/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ item_ids: itemIds }),
    }),

  generateFurniture: (params: FurnitureGenerateRequest) =>
    request<FurnitureCatalogItem>('/api/catalog/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  listSdModels: () =>
    request<string[]>('/api/catalog/models'),

  importFromImage: (file: File, prompt: string, modelId: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('prompt', prompt)
    formData.append('model_id', modelId)
    return fetch(`${BASE}/api/import/image`, {
      method: 'POST',
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`${res.status}: ${text}`)
      }
      return res.json() as Promise<{ json_definition: DesignDefinition; message: string }>
    })
  },
}

export function createChatSocket(
  projectId: string,
  message: string,
  onMessage: (msg: WsMessage) => void,
  onError?: (err: Event) => void,
  onCancel?: () => void,
): WebSocket {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = location.host
  const url = `${protocol}//${host}/api/ws/chat`
  console.log('[WS] Connecting to', url)
  const ws = new WebSocket(url)
  let closed = false

  const cleanup = () => {
    closed = true
    ws.onopen = null
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null
  }

  ws.onopen = () => {
    console.log('[WS] Connected, sending message')
    ws.send(JSON.stringify({ project_id: projectId, message }))
  }
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data) as WsMessage
    console.log('[WS] Received event:', (data as { event: string }).event)
    if (data.event === 'ping') return
    if (data.event === 'complete' || data.event === 'error') {
      onMessage(data)
      cleanup()
      ws.close()
      return
    }
    onMessage(data)
  }
  ws.onerror = (err) => {
    console.error('[WS] Error:', err)
    onError?.(err)
  }
  ws.onclose = (event) => {
    if (closed) return
    cleanup()
    if (event.code !== 1000) {
      console.warn('[WS] Connection lost before generation completed')
    }
    onCancel?.()
  }
  return ws
}
