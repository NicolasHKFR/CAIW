import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToolPanel } from '../../components/ToolPanel'

vi.mock('../../store/sceneStore', () => ({
  useSceneStore: () => ({
    mode: 'house' as const,
    setMode: vi.fn(),
    showWalls: true, toggleWalls: vi.fn(),
    showLabels: true, toggleLabels: vi.fn(),
    showGrid: true, toggleGrid: vi.fn(),
    showDoors: true, toggleDoors: vi.fn(),
    showWindows: true, toggleWindows: vi.fn(),
    activeFloor: 1, setActiveFloor: vi.fn(),
    definition: { rooms: [{ id: 'r1', type: 'living_room', floor: 1 }] },
  }),
}))

vi.mock('../../store/canvasStore', () => ({
  useCanvasStore: () => ({ selectedRoomId: null, selectRoom: vi.fn() }),
}))

describe('ToolPanel', () => {
  it('renders mode toggles', () => {
    render(<ToolPanel />)
    expect(screen.getByText('House')).toBeDefined()
    expect(screen.getByText('Furniture')).toBeDefined()
  })

  it('renders visibility toggles', () => {
    render(<ToolPanel />)
    expect(screen.getByText('Walls')).toBeDefined()
    expect(screen.getByText('Labels')).toBeDefined()
    expect(screen.getByText('Grid')).toBeDefined()
    expect(screen.getByText('Doors')).toBeDefined()
    expect(screen.getByText('Windows')).toBeDefined()
  })

  it('shows room list', () => {
    render(<ToolPanel />)
    expect(screen.getByText('living_room')).toBeDefined()
  })
})
