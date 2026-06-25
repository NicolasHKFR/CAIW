import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Vector3 } from 'three'
import { Grid, PointerLockControls } from '@react-three/drei'
import { XR, createXRStore, XROrigin, TeleportTarget, NotInXR } from '@react-three/xr'
import { RoomMesh } from './RoomMesh'
import { FurnitureMesh } from './FurnitureMesh'
import { DoorMesh } from './DoorMesh'
import { WindowMesh } from './WindowMesh'
import { MeasureTool } from './MeasureTool'
import { VRRoomLabel } from './VRRoomLabel'
import type { DesignDefinition } from '../types'
import { WALL_HEIGHT } from '../constants'
import { computeBounds, roomWorldCenter, furnitureWorldCenter, sceneFloorSize } from '../utils/coordinates'
import { computeDoors, computeWindows } from '../utils/doorsWindows'

export interface VRSceneProps {
  definition: DesignDefinition
  mode: 'vr' | 'desktop'
  showLabels: boolean
  showDoors?: boolean
  showWindows?: boolean
}

let _xrStore: ReturnType<typeof createXRStore> | null = null
function getXrStore() {
  if (!_xrStore) {
    _xrStore = createXRStore({
      controller: { teleportPointer: true },
      hand: { teleportPointer: true },
    })
  }
  return _xrStore
}

function DesktopKeyboard() {
  const { camera } = useThree()
  const keys = useRef({ w: false, a: false, s: false, d: false })

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      switch (e.code) {
        case 'KeyW': keys.current.w = down; break
        case 'KeyA': keys.current.a = down; break
        case 'KeyS': keys.current.s = down; break
        case 'KeyD': keys.current.d = down; break
      }
    }
    const down = (e: KeyboardEvent) => onKey(e, true)
    const up = (e: KeyboardEvent) => onKey(e, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useFrame((_, delta) => {
    const speed = 4
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize()
    const forward = new THREE.Vector3(dir.x, 0, dir.z).normalize()

    if (keys.current.w) camera.position.addScaledVector(forward, speed * delta)
    if (keys.current.s) camera.position.addScaledVector(forward, -speed * delta)
    if (keys.current.a) camera.position.addScaledVector(right, -speed * delta)
    if (keys.current.d) camera.position.addScaledVector(right, speed * delta)
  })

  return <PointerLockControls />
}

function SceneFloor({ bounds, size, onTeleport }: {
  bounds: { cx: number; cy: number }
  size: number
  onTeleport: (pos: Vector3) => void
}) {

  const cx = -bounds.cx
  const cz = bounds.cy

  return (
    <TeleportTarget onTeleport={(p) => onTeleport(p)}>
      <mesh
        position={[cx, -0.01, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial color="#1a1a2e" transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
    </TeleportTarget>
  )
}

function RoomGroup({
  room,
  bounds,
  wallHeight,
  showLabels,
  openings,
}: {
  room: NonNullable<DesignDefinition['rooms']>[number]
  bounds: ReturnType<typeof computeBounds>
  wallHeight: number
  showLabels: boolean
  openings: import('./RoomMesh').WallOpening[]
}) {
  const wc = roomWorldCenter(room, bounds)

  return (
    <group>
      <RoomMesh
        room={room}
        worldX={wc.x}
        worldZ={wc.z}
        wallHeight={wallHeight}
        showWalls
        isSelected={false}
        onClick={() => {}}
        onGroupRef={() => {}}
        openings={openings}
      />

      {showLabels && (
        <VRRoomLabel room={room} worldX={wc.x} worldZ={wc.z} />
      )}

      {(room.furniture ?? []).map((f) => {
        const fw = furnitureWorldCenter(room, f, bounds)
        return (
          <FurnitureMesh
            key={f.id}
            furniture={f}
            worldX={fw.x}
            worldZ={fw.z}
            isSelected={false}
            onClick={() => {}}
            onGroupRef={() => {}}
          />
        )
      })}
    </group>
  )
}

function SceneContent({
  definition,
  showLabels,
  showDoors,
  showWindows,
  playerPos,
  onTeleport,
}: {
  definition: DesignDefinition
  showLabels: boolean
  showDoors: boolean
  showWindows: boolean
  playerPos: Vector3
  onTeleport: (pos: Vector3) => void
}) {
  const rooms = useMemo(
    () => (definition.rooms ?? []).filter((r) => r.x != null && r.y != null && r.w != null && r.h != null),
    [definition],
  )

  const bounds = useMemo(() => computeBounds(rooms), [rooms])
  const floorSize = useMemo(() => sceneFloorSize(rooms), [rooms])

  const toWorld = useCallback(
    (x: number, y: number) => ({ x: x - bounds.cx, z: -(y - bounds.cy) }),
    [bounds],
  )

  const { doorPlacements, doorOpenings, windowPlacements, windowOpenings } = useMemo(() => {
    const dp = computeDoors(rooms, toWorld, WALL_HEIGHT)
    const wp = computeWindows(rooms, toWorld, WALL_HEIGHT)
    return {
      doorPlacements: dp.placements,
      doorOpenings: dp.openings,
      windowPlacements: wp.placements,
      windowOpenings: wp.openings,
    }
  }, [rooms, toWorld])

  const allOpenings = useMemo(() => {
    const map = new Map<string, import('./RoomMesh').WallOpening[]>()
    for (const [id, ops] of doorOpenings) {
      map.set(id, [...(map.get(id) ?? []), ...ops])
    }
    for (const [id, ops] of windowOpenings) {
      map.set(id, [...(map.get(id) ?? []), ...ops])
    }
    return map
  }, [doorOpenings, windowOpenings])

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-5, 5, -5]} intensity={0.3} />

      <Grid
        position={[0, -0.01, 0]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#6f6f80"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#9f9fb0"
        fadeDistance={50}
        args={[floorSize, floorSize]}
      />

      <XROrigin position={playerPos} />

      <SceneFloor bounds={bounds} size={floorSize} onTeleport={onTeleport} />

      {rooms.map((room) => (
        <RoomGroup
          key={room.id}
          room={room}
          bounds={bounds}
          wallHeight={WALL_HEIGHT}
          showLabels={showLabels}
          openings={allOpenings.get(room.id) ?? []}
        />
      ))}

      {showDoors && doorPlacements.map((d, i) => (
        <DoorMesh key={`door-${i}`} placement={d} />
      ))}

      {showWindows && windowPlacements.map((w, i) => (
        <WindowMesh key={`win-${i}`} placement={w} />
      ))}

      <MeasureTool enabled />
    </>
  )
}

function SceneRoot({ definition, mode, showLabels, showDoors, showWindows }: {
  definition: DesignDefinition
  mode: 'vr' | 'desktop'
  showLabels: boolean
  showDoors: boolean
  showWindows: boolean
}) {
  const [playerPos, setPlayerPos] = useState(new Vector3(0, 0, 5))
  const isVr = mode === 'vr'

  const content = useMemo(
    () => (
      <>
        {!isVr && <DesktopKeyboard />}
        <SceneContent
          definition={definition}
          showLabels={showLabels}
          showDoors={showDoors}
          showWindows={showWindows}
          playerPos={playerPos}
          onTeleport={setPlayerPos}
        />
      </>
    ),
    [definition, showLabels, showDoors, showWindows, playerPos, isVr],
  )

  if (isVr) {
    return <XR store={getXrStore()}>{content}</XR>
  }
  return <NotInXR>{content}</NotInXR>
}

export function VRScene({ definition, mode, showLabels, showDoors = true, showWindows = true }: VRSceneProps) {
  const handleEnterVR = useCallback(() => {
    getXrStore().enterVR().catch((e) => console.error('VR entry failed:', e))
  }, [])

  return (
    <>
      {mode === 'vr' && (
        <button
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            padding: '12px 28px',
            background: '#1a1a2e',
            color: '#fff',
            border: '1px solid #4a4a6a',
            borderRadius: 8,
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
            fontSize: 15,
            fontWeight: 600,
          }}
          onClick={handleEnterVR}
        >
          Enter VR
        </button>
      )}
      <Canvas
        camera={{ position: [0, 1.6, 5], fov: 75, near: 0.1, far: 200 }}
        onCreated={({ scene }) => {
          scene.background = new THREE.Color('#16213e')
        }}
      >
        <SceneRoot definition={definition} mode={mode} showLabels={showLabels} showDoors={showDoors} showWindows={showWindows} />
      </Canvas>
    </>
  )
}
