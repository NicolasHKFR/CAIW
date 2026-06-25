export const ROOM_COLORS = [
  '#e8dcc8', '#c8d8e8', '#d4e8c8', '#f0d0d0', '#d0d0f0', '#f0e8c0', '#e0e0e0',
]

export function hashColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return ROOM_COLORS[Math.abs(hash) % ROOM_COLORS.length]
}

export const WALL_HEIGHT = 2.5

export const SCALE = 30

export const GRID_SIZE = 0.5
