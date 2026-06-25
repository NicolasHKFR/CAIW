import * as THREE from 'three'
import { useMemo } from 'react'
import { type Group } from 'three'
import type { RoomSpec } from '../types'
import { hashColor } from '../constants'

export interface WallOpening {
  side: 'N' | 'S' | 'E' | 'W'
  center: number
  width: number
  height: number
  fromFloor: number
}

export interface RoomMeshProps {
  room: RoomSpec
  worldX: number
  worldZ: number
  wallHeight: number
  showWalls: boolean
  isSelected: boolean
  onClick?: () => void
  onGroupRef?: (group: Group | null) => void
  openings?: WallOpening[]
}

const floorGeo = new THREE.BoxGeometry(1, 0.05, 1)
const outlineGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.01, 1))
const wallMat = new THREE.MeshStandardMaterial({ color: '#ddd', side: THREE.DoubleSide })

function WallShape({ width, height, thickness, openings }: {
  width: number; height: number; thickness: number
  openings: { center: number; width: number; height: number; fromFloor: number }[]
}) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-width / 2, 0)
    shape.lineTo(width / 2, 0)
    shape.lineTo(width / 2, height)
    shape.lineTo(-width / 2, height)
    shape.closePath()

    for (const op of openings) {
      const hole = new THREE.Path()
      const left = op.center - op.width / 2
      const right = op.center + op.width / 2
      hole.moveTo(left, op.fromFloor)
      hole.lineTo(right, op.fromFloor)
      hole.lineTo(right, op.fromFloor + op.height)
      hole.lineTo(left, op.fromFloor + op.height)
      hole.closePath()
      shape.holes.push(hole)
    }

    return new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: false,
    })
  }, [width, height, thickness, openings])

  return <mesh geometry={geometry} material={wallMat} />
}

export function RoomMesh({
  room,
  worldX,
  worldZ,
  wallHeight,
  showWalls,
  isSelected,
  onClick,
  onGroupRef,
  openings = [],
}: RoomMeshProps) {
  const w = room.w ?? 1
  const h = room.h ?? 1
  const color = hashColor(room.id)
  const wallThickness = 0.05

  const nOpenings = useMemo(() =>
    openings.filter(o => o.side === 'N'), [openings])
  const sOpenings = useMemo(() =>
    openings.filter(o => o.side === 'S'), [openings])
  const eOpenings = useMemo(() =>
    openings.filter(o => o.side === 'E'), [openings])
  const wOpenings = useMemo(() =>
    openings.filter(o => o.side === 'W'), [openings])

  const wallId = useMemo(() => {
    const key = [nOpenings.length, sOpenings.length, eOpenings.length, wOpenings.length, w, h, wallHeight].join(',')
    return key
  }, [nOpenings, sOpenings, eOpenings, wOpenings, w, h, wallHeight])

  return (
    <group ref={onGroupRef} position={[worldX, 0, worldZ]} onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}>
      <mesh geometry={floorGeo} scale={[w, 1, h]} position={[0, 0.025, 0]} receiveShadow>
        <meshStandardMaterial color={color} />
      </mesh>

      <lineSegments geometry={outlineGeo} scale={[w, 1, h]} position={[0, 0.026, 0]}>
        <lineBasicMaterial color={isSelected ? '#e94560' : '#888'} />
      </lineSegments>

      {showWalls && (
        <>
          <group position={[0, 0, -h / 2]}>
            <WallShape key={`n-${wallId}`} width={w} height={wallHeight} thickness={wallThickness} openings={nOpenings} />
          </group>
          <group position={[0, 0, h / 2]} rotation={[0, Math.PI, 0]}>
            <WallShape key={`s-${wallId}`} width={w} height={wallHeight} thickness={wallThickness} openings={sOpenings} />
          </group>
          <group position={[w / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <WallShape key={`e-${wallId}`} width={h} height={wallHeight} thickness={wallThickness} openings={eOpenings} />
          </group>
          <group position={[-w / 2, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <WallShape key={`w-${wallId}`} width={h} height={wallHeight} thickness={wallThickness} openings={wOpenings} />
          </group>
        </>
      )}

      {isSelected && (
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[w + 0.1, 0.02, h + 0.1]} />
          <meshBasicMaterial color="#e94560" transparent opacity={0.15} />
        </mesh>
      )}
    </group>
  )
}
