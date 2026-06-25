import { create } from 'zustand'
import type { RoomSpec } from '../types'

export interface RoomBounds {
  x: number; y: number; w: number; h: number
}

interface CanvasState {
  scale: number
  panX: number
  panY: number
  gridSize: number
  snapToGrid: boolean
  selectedRoomId: string | null
  hoveredRoomId: string | null
  draggedRoomId: string | null
  compareVersion: number | null
  selectedFloor: number
  undoStack: RoomSpec[][]
  redoStack: RoomSpec[][]

  setScale: (s: number) => void
  setPan: (x: number, y: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetView: () => void
  fitToContent: (rooms: RoomBounds[], containerW: number, containerH: number) => void
  selectRoom: (id: string | null) => void
  hoverRoom: (id: string | null) => void
  dragRoom: (id: string | null) => void
  setCompareVersion: (v: number | null) => void
  setSelectedFloor: (floor: number) => void
  pushUndo: (rooms: RoomSpec[]) => void
  undo: () => RoomSpec[] | null
  redo: () => RoomSpec[] | null
}

export const useCanvasStore = create<CanvasState>((set) => ({
  scale: 30,
  panX: 40,
  panY: 40,
  gridSize: 0.5,
  snapToGrid: true,
  selectedRoomId: null,
  hoveredRoomId: null,
  draggedRoomId: null,
  compareVersion: null,
  selectedFloor: 1,
  undoStack: [],
  redoStack: [],

  setScale: (scale) => set({ scale: Math.max(5, Math.min(200, scale)) }),
  setPan: (panX, panY) => set({ panX, panY }),
  zoomIn: () => set((s) => ({ scale: Math.min(200, s.scale * 1.2) })),
  zoomOut: () => set((s) => ({ scale: Math.max(5, s.scale / 1.2) })),
  resetView: () => set({ scale: 30, panX: 40, panY: 40 }),
  fitToContent: (rooms, containerW, containerH) => {
    if (!rooms.length || !containerW || !containerH) return
    const xs = rooms.map(r => r.x)
    const ys = rooms.map(r => r.y)
    const xes = rooms.map(r => r.x + r.w)
    const yes = rooms.map(r => r.y + r.h)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xes)
    const maxY = Math.max(...yes)
    const contentW = maxX - minX
    const contentH = maxY - minY
    const padding = 1.5
    const scaleX = (containerW - 80) / (contentW + padding * 2)
    const scaleY = (containerH - 80) / (contentH + padding * 2)
    const scale = Math.max(5, Math.min(200, Math.floor(Math.min(scaleX, scaleY))))
    const panX = (containerW - contentW * scale) / 2 - minX * scale
    const panY = (containerH - contentH * scale) / 2 - minY * scale
    set({ scale, panX, panY })
  },
  selectRoom: (id) => set({ selectedRoomId: id, draggedRoomId: null }),
  hoverRoom: (id) => set({ hoveredRoomId: id }),
  dragRoom: (id) => set({ draggedRoomId: id }),
  setCompareVersion: (v) => set({ compareVersion: v }),
  setSelectedFloor: (floor) => set({ selectedFloor: floor }),
  pushUndo: (rooms) => set((s) => ({
    undoStack: [...s.undoStack.slice(-49), rooms.map(r => ({ ...r, furniture: r.furniture.map(f => ({ ...f })) }))],
    redoStack: [],
  })),
  undo: (): RoomSpec[] | null => {
    const state = useCanvasStore.getState()
    if (!state.undoStack.length) return null
    const prev: RoomSpec[] = state.undoStack[state.undoStack.length - 1]
    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, prev],
    }))
    return prev
  },
  redo: (): RoomSpec[] | null => {
    const state = useCanvasStore.getState()
    if (!state.redoStack.length) return null
    const next: RoomSpec[] = state.redoStack[state.redoStack.length - 1]
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, next],
    }))
    return next
  },
}))
