import { useMemo, useState, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, TransformControls, Grid, Html } from '@react-three/drei'
import * as THREE from 'three'
import { useSceneStore } from '../store/sceneStore'
import { RoomMesh, type WallOpening } from './RoomMesh'
import { FurnitureMesh } from './FurnitureMesh'
import { DoorMesh, type DoorPlacement } from './DoorMesh'
import { WindowMesh, type WindowPlacement } from './WindowMesh'
import type { RoomSpec } from '../types'

interface Bounds {
  cx: number
  cy: number
}

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

function computeDoors(rooms: RoomSpec[], toWorld: (x: number, y: number) => { x: number; z: number }, wallHeight: number): {
  placements: DoorPlacement[]
  openings: Map<string, WallOpening[]>
} {
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

      const roomIds = [a.id, b.id]
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

function oppositeSide(s: 'N' | 'S' | 'E' | 'W'): 'N' | 'S' | 'E' | 'W' {
  switch (s) {
    case 'N': return 'S'
    case 'S': return 'N'
    case 'E': return 'W'
    case 'W': return 'E'
  }
}

function computeWindows(rooms: RoomSpec[], toWorld: (x: number, y: number) => { x: number; z: number }, wallHeight: number): {
  placements: WindowPlacement[]
  openings: Map<string, WallOpening[]>
} {
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

function SceneContent() {
  const {
    definition, activeFloor, wallHeight, showWalls, showLabels, showGrid,
    selection, selectObject, clearSelection,
    showDoors, showWindows,
  } = useSceneStore()

  const [transformTarget, setTransformTarget] = useState<THREE.Object3D | null>(null)

  const rooms = useMemo(() => {
    return (definition?.rooms ?? []).filter(
      (r): r is typeof r & { x: number; y: number; w: number; h: number } =>
        r.floor === activeFloor && r.x != null && r.y != null && r.w != null && r.h != null,
    )
  }, [definition, activeFloor])

  const bounds: Bounds = useMemo(() => {
    if (!rooms.length) return { cx: 0, cy: 0 }
    const xs = rooms.map(r => r.x)
    const ys = rooms.map(r => r.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...rooms.map(r => r.x + r.w))
    const minY = Math.min(...ys)
    const maxY = Math.max(...rooms.map(r => r.y + r.h))
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
  }, [rooms])

  const toWorld = useCallback(
    (x: number, y: number) => ({ x: x - bounds.cx, z: -(y - bounds.cy) }),
    [bounds],
  )

  const { doorPlacements, doorOpenings, windowPlacements, windowOpenings } = useMemo(() => {
    const dp = computeDoors(rooms, toWorld, wallHeight)
    const wp = computeWindows(rooms, toWorld, wallHeight)
    return {
      doorPlacements: dp.placements,
      doorOpenings: dp.openings,
      windowPlacements: wp.placements,
      windowOpenings: wp.openings,
    }
  }, [rooms, toWorld, wallHeight])

  const allOpenings = useMemo(() => {
    const map = new Map<string, WallOpening[]>()
    for (const [id, ops] of doorOpenings) {
      map.set(id, [...(map.get(id) ?? []), ...ops])
    }
    for (const [id, ops] of windowOpenings) {
      map.set(id, [...(map.get(id) ?? []), ...ops])
    }
    return map
  }, [doorOpenings, windowOpenings])

  const handleBackgroundClick = useCallback(() => {
    clearSelection()
    setTransformTarget(null)
  }, [clearSelection])

  const handleRoomClick = useCallback(
    (e: any, roomId: string) => {
      e.stopPropagation()
      selectObject(roomId, 'room')
      setTransformTarget(e.eventObject)
    },
    [selectObject],
  )

  const handleFurnitureClick = useCallback(
    (e: any, furnitureId: string, roomId: string) => {
      e.stopPropagation()
      selectObject(furnitureId, 'furniture', roomId)
      setTransformTarget(e.eventObject)
    },
    [selectObject],
  )

  const dimensions = useMemo(() => {
    if (!rooms.length) return null
    const minX = Math.min(...rooms.map(r => r.x))
    const maxX = Math.max(...rooms.map(r => r.x + r.w))
    const minY = Math.min(...rooms.map(r => r.y))
    const maxY = Math.max(...rooms.map(r => r.y + r.h))
    return { w: maxX - minX, h: maxY - minY }
  }, [rooms])

  if (!rooms.length) {
    return (
      <Html center>
        <div style={{ color: '#a0a0b0', fontSize: 14 }}>No rooms on this floor</div>
      </Html>
    )
  }

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 15, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-5, 5, -5]} intensity={0.3} />

      <OrbitControls makeDefault />

      {showGrid && (
        <Grid
          position={[0, -0.01, 0]}
          args={[Math.max(40, (dimensions?.w ?? 10) * 2), Math.max(40, (dimensions?.h ?? 10) * 2)]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#6f6f80"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#9f9fb0"
          fadeDistance={50}
        />
      )}

      {rooms.map(room => {
        const wp = toWorld(room.x, room.y)
        const openings = allOpenings.get(room.id) ?? []
        return (
          <group key={room.id}>
            <RoomMesh
              room={room}
              worldX={wp.x}
              worldZ={wp.z}
              wallHeight={wallHeight}
              showWalls={showWalls}
              isSelected={selection.objectId === room.id && selection.objectType === 'room'}
              onClick={() => {}}
              onGroupRef={() => {}}
              openings={openings}
            />
            <mesh
              position={[wp.x + room.w / 2, 0.001, wp.z - room.h / 2]}
              visible={false}
              onClick={(e) => handleRoomClick(e, room.id)}
            >
              <planeGeometry args={[room.w, room.h]} />
              <meshBasicMaterial transparent opacity={0} />
            </mesh>

            {showLabels && (
              <Html position={[wp.x + room.w / 2, wallHeight + 0.5, wp.z - room.h / 2]} center>
                <div style={{
                  background: 'rgba(0,0,0,0.5)',
                  color: '#fff',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: 'Inter, sans-serif',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}>
                  {room.type}
                </div>
              </Html>
            )}

            {(room.furniture ?? []).map(f => {
              const fw = toWorld(room.x + f.x + f.width / 2, room.y + f.y + f.length / 2)
              return (
                <FurnitureMesh
                  key={f.id}
                  furniture={f}
                  worldX={fw.x}
                  worldZ={fw.z}
                  isSelected={selection.objectId === f.id && selection.objectType === 'furniture'}
                  onClick={() => {}}
                  onGroupRef={() => {}}
                />
              )
            })}

            {(room.furniture ?? []).map(f => {
              const fw = toWorld(room.x + f.x + f.width / 2, room.y + f.y + f.length / 2)
              return (
                <mesh
                  key={`hit-${f.id}`}
                  position={[fw.x, 0.001, fw.z]}
                  visible={false}
                  onClick={(e) => handleFurnitureClick(e, f.id, room.id)}
                >
                  <planeGeometry args={[f.width, f.length]} />
                  <meshBasicMaterial transparent opacity={0} />
                </mesh>
              )
            })}
          </group>
        )
      })}

      {showDoors && doorPlacements.map((d, i) => (
        <DoorMesh key={`door-${i}`} placement={d} />
      ))}

      {showWindows && windowPlacements.map((w, i) => (
        <WindowMesh key={`win-${i}`} placement={w} />
      ))}

      {transformTarget && (
        <TransformControls object={transformTarget} mode="translate" />
      )}
    </>
  )
}

export function SceneView() {
  return (
    <div style={{ flex: 1, position: 'relative' }}>
      <Canvas
        camera={{ position: [15, 12, 15], fov: 45, near: 0.1, far: 200 }}
        onCreated={({ scene }) => {
          scene.background = new THREE.Color('#16213e')
        }}
      >
        <SceneContent />
      </Canvas>
    </div>
  )
}
