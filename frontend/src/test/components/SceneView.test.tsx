import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SceneView } from '../../components/SceneView'
import type { DesignDefinition } from '../../types'

vi.mock('../../store/sceneStore', () => ({
  useSceneStore: () => ({
    projectId: null,
    designVersion: null,
    definition: null,
    loading: false,
    error: null,
    mode: 'house' as const,
    activeFloor: 1,
    wallHeight: 2.5,
    showWalls: true,
    showLabels: true,
    showGrid: true,
    showDimensions: false,
    showDoors: true,
    showWindows: true,
    selection: { objectId: null, objectType: null, roomParentId: null },
    loadDesign: vi.fn(),
    setMode: vi.fn(),
    setActiveFloor: vi.fn(),
    toggleWalls: vi.fn(),
    toggleLabels: vi.fn(),
    toggleGrid: vi.fn(),
    toggleDimensions: vi.fn(),
    toggleDoors: vi.fn(),
    toggleWindows: vi.fn(),
    selectObject: vi.fn(),
    clearSelection: vi.fn(),
    removeSelectedRoom: vi.fn(),
  }),
}))

vi.mock('../../store/canvasStore', () => ({
  useCanvasStore: () => ({ selectedRoomId: null, selectRoom: vi.fn() }),
}))

describe('SceneView', () => {
  it('renders without crashing', () => {
    const { container } = render(<SceneView />)
    expect(container).toBeDefined()
  })
})
