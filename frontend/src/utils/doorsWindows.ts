import type { RoomSpec } from '../types'
import type { WallOpening } from '../components/RoomMesh'
import type { DoorPlacement } from '../components/DoorMesh'
import type { WindowPlacement } from '../components/WindowMesh'

function sharedEdgeLength(a: RoomSpec, b: RoomSpec): number {
  if (a.x == null || a.y == null || a.w == null || a.h == null) return 0
  if (b.x == null || b.y == null || b.w == null || b.h == null) return 0
  const horiz = Math.abs(a.y + a.h - b.y) < 0.01 || Math.abs(b.y + b.h - a.y) < 0.01
  const vert = Math.abs(a.x + a.w - b.x) < 0.01 || Math.abs(b.x + b.w - a.x) < 0.01
  if (horiz) {
    const left = Math.max(a.x, b.x)
    const right = Math.min(a.x + a.w, b.x + b.w)
    return Math.max(0, right - left)
  }
  if (vert) {
    const top = Math.max(a.y, b.y)
    const bottom = Math.min(a.y + a.h, b.y + b.h)
    return Math.max(0, bottom - top)
  }
  return 0
}

function sharedEdgeSide(a: RoomSpec, b: RoomSpec): 'N' | 'S' | 'E' | 'W' | null {
  if (a.x == null || a.y == null || a.w == null || a.h == null) return null
  if (b.x == null || b.y == null || b.w == null || b.h == null) return null
  if (Math.abs(a.y + a.h - b.y) < 0.01) return 'S'
  if (Math.abs(b.y + b.h - a.y) < 0.01) return 'N'
  if (Math.abs(a.x + a.w - b.x) < 0.01) return 'E'
  if (Math.abs(b.x + b.w - a.x) < 0.01) return 'W'
  return null
}

function overlapMidpoint(a: RoomSpec, b: RoomSpec): { x: number; y: number } | null {
  if (a.x == null || a.y == null || a.w == null || a.h == null) return null
  if (b.x == null || b.y == null || b.w == null || b.h == null) return null
  const side = sharedEdgeSide(a, b)
  if (!side) return null
  if (side === 'N' || side === 'S') {
    const left = Math.max(a.x, b.x)
    const right = Math.min(a.x + a.w, b.x + b.w)
    return { x: (left + right) / 2, y: side === 'S' ? a.y + a.h : a.y }
  }
  const top = Math.max(a.y, b.y)
  const bottom = Math.min(a.y + a.h, b.y + b.h)
  return { x: side === 'E' ? a.x + a.w : a.x, y: (top + bottom) / 2 }
}

function rotationForRoomSide(side: 'N' | 'S' | 'E' | 'W'): number {
  switch (side) {
    case 'N': return 0
    case 'S': return Math.PI
    case 'E': return -Math.PI / 2
    case 'W': return Math.PI / 2
  }
}

function rotationForExteriorSide(side: 'N' | 'S' | 'E' | 'W'): number {
  switch (side) {
    case 'N': return Math.PI
    case 'S': return 0
    case 'E': return Math.PI / 2
    case 'W': return -Math.PI / 2
  }
}

function oppositeSide(s: 'N' | 'S' | 'E' | 'W'): 'N' | 'S' | 'E' | 'W' {
  switch (s) {
    case 'N': return 'S'
    case 'S': return 'N'
    case 'E': return 'W'
    case 'W': return 'E'
  }
}

export interface DoorsResult {
  placements: DoorPlacement[]
  openings: Map<string, WallOpening[]>
}

export function computeDoors(
  rooms: RoomSpec[],
  toWorld: (x: number, y: number) => { x: number; z: number },
  wallHeight: number,
): DoorsResult {
  const placements: DoorPlacement[] = []
  const openings = new Map<string, WallOpening[]>()

  const valid = rooms.filter(r => r.x != null && r.y != null && r.w != null && r.h != null)

  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const a = valid[i]
      const b = valid[j]
      if (a.floor !== b.floor) continue
      const hasConn = (a.preferredConnections ?? []).includes(b.id) ||
                      (b.preferredConnections ?? []).includes(a.id)
      if (!hasConn) continue

      const edge = sharedEdgeLength(a, b)
      if (edge < 0.5) continue

      const sideA = sharedEdgeSide(a, b)
      if (!sideA) continue

      const mp = overlapMidpoint(a, b)
      if (!mp) continue

      const wp = toWorld(mp.x, mp.y)
      const rotation = rotationForRoomSide(sideA)

      placements.push({
        worldX: wp.x,
        worldZ: wp.z,
        rotation,
      })

      const doorW = 0.9
      const doorH = Math.min(2.1, wallHeight - 0.1)

      const sides = [sideA, oppositeSide(sideA)]

      for (let k = 0; k < 2; k++) {
        const room = k === 0 ? a : b
        const side = sides[k]
        let center: number
        if (side === 'N' || side === 'S') {
          center = mp.x - (room.x! + room.w! / 2)
        } else {
          center = mp.y - (room.y! + room.h! / 2)
        }
        const existing = openings.get(room.id) ?? []
        existing.push({ side, center, width: doorW, height: doorH, fromFloor: 0 })
        openings.set(room.id, existing)
      }
    }
  }

  return { placements, openings }
}

export interface WindowsResult {
  placements: WindowPlacement[]
  openings: Map<string, WallOpening[]>
}

export function computeWindows(
  rooms: RoomSpec[],
  toWorld: (x: number, y: number) => { x: number; z: number },
  wallHeight: number,
): WindowsResult {
  const placements: WindowPlacement[] = []
  const openings = new Map<string, WallOpening[]>()

  const valid = rooms.filter(r => r.x != null && r.y != null && r.w != null && r.h != null)

  for (const room of valid) {
    const roomOpenings: WallOpening[] = []

    for (const side of ['N', 'S', 'E', 'W'] as const) {
      const wallLen = (side === 'N' || side === 'S') ? room.w! : room.h!

      const blocked: { left: number; right: number }[] = []
      for (const other of valid) {
        if (other.id === room.id || other.floor !== room.floor) continue
        const edge = sharedEdgeLength(room, other)
        if (edge < 0.01) continue
        const otherSide = sharedEdgeSide(room, other)
        if (otherSide !== side) continue
        const mp = overlapMidpoint(room, other)
        if (!mp) continue
        const w = side === 'N' || side === 'S' ? edge : edge
        const center = side === 'N' || side === 'S' ? mp.x - (room.x! + room.w! / 2) : mp.y - (room.y! + room.h! / 2)
        blocked.push({ left: center - w / 2, right: center + w / 2 })
      }

      const half = wallLen / 2
      const segments: { left: number; right: number }[] = [{ left: -half, right: half }]
      for (const b of blocked) {
        for (let si = segments.length - 1; si >= 0; si--) {
          const seg = segments[si]
          if (b.right <= seg.left || b.left >= seg.right) continue
          segments.splice(si, 1)
          if (b.left > seg.left) segments.push({ left: seg.left, right: b.left })
          if (b.right < seg.right) segments.push({ left: b.right, right: seg.right })
        }
      }

      for (const seg of segments) {
        const segLen = seg.right - seg.left
        if (segLen < 1.5) continue
        const winW = Math.min(1.2, segLen - 0.4)
        const winH = Math.min(1.2, wallHeight - 1.0)
        const count = segLen > 6 ? 2 : 1
        for (let wi = 0; wi < count; wi++) {
          const c = seg.left + (segLen / (count + 1)) * (wi + 1)

          const centerInBackend = side === 'N' || side === 'S'
            ? { x: c + room.x! + room.w! / 2, y: side === 'N' ? room.y! : room.y! + room.h! }
            : { x: side === 'E' ? room.x! + room.w! : room.x!, y: c + room.y! + room.h! / 2 }

          const wp = toWorld(centerInBackend.x, centerInBackend.y)
          const wRotation = rotationForExteriorSide(side)
          placements.push({ worldX: wp.x, worldZ: wp.z, rotation: wRotation })

          roomOpenings.push({
            side,
            center: c,
            width: winW,
            height: winH,
            fromFloor: 0.9,
          })
        }
      }
    }

    openings.set(room.id, roomOpenings)
  }

  return { placements, openings }
}
