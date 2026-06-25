export interface Bounds {
  cx: number
  cy: number
}

export function centerOf(room: {
  x: number | null
  y: number | null
  w: number | null
  h: number | null
}): { x: number; y: number } {
  return {
    x: (room.x ?? 0) + (room.w ?? 1) / 2,
    y: (room.y ?? 0) + (room.h ?? 1) / 2,
  }
}

export function toWorldX(solverX: number, cx: number): number {
  return solverX - cx
}

export function toWorldZ(solverY: number, cy: number): number {
  return -(solverY - cy)
}

export function roomWorldCenter(
  room: { x: number | null; y: number | null; w: number | null; h: number | null },
  bounds: Bounds,
): { x: number; z: number } {
  const c = centerOf(room)
  return { x: toWorldX(c.x, bounds.cx), z: toWorldZ(c.y, bounds.cy) }
}

export function furnitureWorldCenter(
  room: { x: number | null; y: number | null },
  f: { x: number; y: number; width: number; length: number },
  bounds: Bounds,
): { x: number; z: number } {
  const fx = (room.x ?? 0) + f.x + f.width / 2
  const fy = (room.y ?? 0) + f.y + f.length / 2
  return { x: toWorldX(fx, bounds.cx), z: toWorldZ(fy, bounds.cy) }
}

export function computeBounds(
  rooms: Array<{ x: number | null; y: number | null; w: number | null; h: number | null }>,
): Bounds {
  if (!rooms.length) return { cx: 0, cy: 0 }
  const xs = rooms.map((r) => r.x ?? 0)
  const ys = rooms.map((r) => r.y ?? 0)
  const minX = Math.min(...xs)
  const maxX = Math.max(...rooms.map((r) => (r.x ?? 0) + (r.w ?? 1)))
  const minY = Math.min(...ys)
  const maxY = Math.max(...rooms.map((r) => (r.y ?? 0) + (r.h ?? 1)))
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
}

export function sceneFloorSize(
  rooms: Array<{ x: number | null; y: number | null; w: number | null; h: number | null }>,
): number {
  if (!rooms.length) return 28
  const ws = rooms.map((r) => (r.x ?? 0) + (r.w ?? 1))
  const hs = rooms.map((r) => (r.y ?? 0) + (r.h ?? 1))
  const maxDim = Math.max(Math.max(...ws) - Math.min(...rooms.map((r) => r.x ?? 0)),
    Math.max(...hs) - Math.min(...rooms.map((r) => r.y ?? 0)))
  return maxDim * 2 + 8
}
