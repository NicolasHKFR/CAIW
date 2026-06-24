import { create } from 'zustand'
import { api } from '../api'
import type { DesignDefinition } from '../types'

export interface SelectionState {
  objectId: string | null
  objectType: 'room' | 'furniture' | null
  roomParentId: string | null
}

export interface SceneState {
  projectId: string | null
  designVersion: number | null
  definition: DesignDefinition | null
  loading: boolean
  error: string | null
  mode: 'house' | 'furniture'
  activeFloor: number
  wallHeight: number
  showWalls: boolean
  showLabels: boolean
  showGrid: boolean
  showDimensions: boolean
  showDoors: boolean
  showWindows: boolean
  selection: SelectionState

  loadDesign: (projectId: string, version: number) => Promise<void>
  setMode: (mode: 'house' | 'furniture') => void
  setActiveFloor: (floor: number) => void
  toggleWalls: () => void
  toggleLabels: () => void
  toggleGrid: () => void
  toggleDimensions: () => void
  toggleDoors: () => void
  toggleWindows: () => void
  selectObject: (objectId: string, objectType: 'room' | 'furniture', roomParentId?: string) => void
  clearSelection: () => void
}

export const useSceneStore = create<SceneState>((set, get) => ({
  projectId: null,
  designVersion: null,
  definition: null,
  loading: false,
  error: null,
  mode: 'house',
  activeFloor: 1,
  wallHeight: 2.5,
  showWalls: true,
  showLabels: true,
  showGrid: true,
  showDimensions: false,
  showDoors: true,
  showWindows: true,
  selection: { objectId: null, objectType: null, roomParentId: null },

  loadDesign: async (projectId, version) => {
    set({ loading: true, error: null })
    try {
      const design = await api.getDesign(projectId, version)
      const floors = [...new Set((design.json_definition.rooms ?? []).map(r => r.floor))].sort((a, b) => a - b)
      set({
        projectId,
        designVersion: version,
        definition: design.json_definition,
        activeFloor: floors[0] ?? 1,
        loading: false,
        selection: { objectId: null, objectType: null, roomParentId: null },
      })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to load design' })
    }
  },

  setMode: (mode) => set({ mode, selection: { objectId: null, objectType: null, roomParentId: null } }),
  setActiveFloor: (activeFloor) => set({ activeFloor, selection: { objectId: null, objectType: null, roomParentId: null } }),
  toggleWalls: () => set((s) => ({ showWalls: !s.showWalls })),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleDimensions: () => set((s) => ({ showDimensions: !s.showDimensions })),
  toggleDoors: () => set((s) => ({ showDoors: !s.showDoors })),
  toggleWindows: () => set((s) => ({ showWindows: !s.showWindows })),

  selectObject: (objectId, objectType, roomParentId) =>
    set({ selection: { objectId, objectType, roomParentId: roomParentId ?? null } }),

  clearSelection: () =>
    set({ selection: { objectId: null, objectType: null, roomParentId: null } }),
}))
