import { type Group } from 'three'
import type { FurnitureItem } from '../types'

export interface FurnitureMeshProps {
  furniture: FurnitureItem
  worldX: number
  worldZ: number
  isSelected: boolean
  onClick: () => void
  onGroupRef: (group: Group | null) => void
}

function getShapeType(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('sofa') || lower.includes('couch') || lower.includes('canap')) return 'sofa'
  if (lower.includes('bed') || lower.includes('lit')) return 'bed'
  if (lower.includes('table') || lower.includes('dining') || lower.includes('coffee')) return 'table'
  if (lower.includes('chair') || lower.includes('chaise') || lower.includes('seat')) return 'chair'
  if (lower.includes('cabinet') || lower.includes('wardrobe') || lower.includes('armoire')) return 'cabinet'
  if (lower.includes('bathtub') || lower.includes('bath')) return 'bathtub'
  if (lower.includes('toilet') || lower.includes('wc')) return 'toilet'
  if (lower.includes('desk') || lower.includes('bureau')) return 'desk'
  if (lower.includes('shelf') || lower.includes('bookcase') || lower.includes('tag')) return 'shelf'
  if (lower.includes('stair')) return 'stairs'
  if (lower.includes('wardrobe') || lower.includes('closet')) return 'wardrobe'
  return 'box'
}

function getShapeHeight(name: string): number {
  const shape = getShapeType(name)
  const heights: Record<string, number> = {
    sofa: 0.8, bed: 0.5, table: 0.75, chair: 0.45, cabinet: 1.2,
    bathtub: 0.6, toilet: 0.4, desk: 0.75, shelf: 1.8, stairs: 2.5,
    wardrobe: 2.0, box: 0.8,
  }
  return heights[shape] ?? 0.8
}

function getShapeColor(name: string): string {
  const shape = getShapeType(name)
  const colors: Record<string, string> = {
    sofa: '#8B7355', bed: '#c4a882', table: '#a0845c', chair: '#9c8c7c',
    cabinet: '#8B7D6B', bathtub: '#d4d4d4', toilet: '#e8e8e8', desk: '#7c6e5a',
    shelf: '#8B7D6B', stairs: '#a0a0a0', wardrobe: '#7c6e5a', box: '#b8a898',
  }
  return colors[shape] ?? '#b8a898'
}

export function FurnitureMesh({
  furniture,
  worldX,
  worldZ,
  isSelected,
  onClick,
  onGroupRef,
}: FurnitureMeshProps) {
  const w = furniture.width
  const l = furniture.length
  const h = getShapeHeight(furniture.name)
  const color = getShapeColor(furniture.name)
  const shape = getShapeType(furniture.name)

  return (
    <group
      ref={onGroupRef}
      position={[worldX, 0, worldZ]}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {shape === 'sofa' && (
        <>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[w, 0.4, l]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, 0.45, -l / 2 + 0.05]}>
            <boxGeometry args={[w, 0.5, 0.1]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[-w / 2 + 0.05, 0.3, 0]}>
            <boxGeometry args={[0.1, 0.3, l]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[w / 2 - 0.05, 0.3, 0]}>
            <boxGeometry args={[0.1, 0.3, l]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </>
      )}

      {shape === 'bed' && (
        <>
          <mesh position={[0, 0.15, 0]}>
            <boxGeometry args={[w, 0.3, l]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, 0.25, l / 2 - 0.05]}>
            <boxGeometry args={[w, 0.1, 0.1]} />
            <meshStandardMaterial color="#ddd" />
          </mesh>
        </>
      )}

      {shape === 'table' && (
        <>
          <mesh position={[0, 0.725, 0]}>
            <boxGeometry args={[w, 0.05, l]} />
            <meshStandardMaterial color={color} />
          </mesh>
          {[[-w / 2 + 0.05, 0.35, -l / 2 + 0.05],
            [w / 2 - 0.05, 0.35, -l / 2 + 0.05],
            [-w / 2 + 0.05, 0.35, l / 2 - 0.05],
            [w / 2 - 0.05, 0.35, l / 2 - 0.05],
          ].map(([px, py, pz], i) => (
            <mesh key={i} position={[px, py, pz]}>
              <cylinderGeometry args={[0.025, 0.03, 0.7]} />
              <meshStandardMaterial color="#666" />
            </mesh>
          ))}
        </>
      )}

      {shape === 'chair' && (
        <>
          <mesh position={[0, 0.425, 0]}>
            <boxGeometry args={[0.35, 0.05, 0.35]} />
            <meshStandardMaterial color={color} />
          </mesh>
          {[[-0.15, 0.2, -0.15], [0.15, 0.2, -0.15],
            [-0.15, 0.2, 0.15], [0.15, 0.2, 0.15],
          ].map(([px, py, pz], i) => (
            <mesh key={i} position={[px, py, pz]}>
              <cylinderGeometry args={[0.015, 0.02, 0.4]} />
              <meshStandardMaterial color="#666" />
            </mesh>
          ))}
          <mesh position={[0, 0.65, -0.2]}>
            <boxGeometry args={[0.35, 0.45, 0.04]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </>
      )}

      {(shape === 'cabinet' || shape === 'box') && (
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[w, h, l]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}

      {shape === 'bathtub' && (
        <>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[w, 0.6, l]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, 0.32, 0]}>
            <boxGeometry args={[w - 0.1, 0.04, l - 0.1]} />
            <meshStandardMaterial color="#c0c0c0" />
          </mesh>
        </>
      )}

      {shape === 'toilet' && (
        <>
          <mesh position={[0, 0.15, l / 2 - 0.08]}>
            <boxGeometry args={[0.3, 0.3, 0.15]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, 0.15, -l / 2 + 0.08]}>
            <boxGeometry args={[0.25, 0.15, 0.15]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </>
      )}

      {shape === 'desk' && (
        <>
          <mesh position={[0, 0.725, 0]}>
            <boxGeometry args={[w, 0.04, l]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[-w / 2 + 0.03, 0.36, 0]}>
            <boxGeometry args={[0.04, 0.72, l]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[w / 2 - 0.03, 0.36, 0]}>
            <boxGeometry args={[0.04, 0.72, l]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </>
      )}

      {shape === 'shelf' && (
        <>
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w, h, l]} />
            <meshStandardMaterial color={color} />
          </mesh>
          {[1, 2, 3].map((i) => (
            <mesh key={i} position={[0, i * (h / 4), 0]}>
              <boxGeometry args={[w - 0.04, 0.03, l - 0.04]} />
              <meshStandardMaterial color="#a09080" />
            </mesh>
          ))}
        </>
      )}

      {shape === 'stairs' && (
        <>
          {[0, 1, 2, 3, 4].map((i) => {
            const treadW = Math.max(0.2, w - i * 0.2)
            const treadH = (h / 5)
            const treadL = l / 5
            return (
              <mesh key={i} position={[-w / 2 + treadW / 2 + i * 0.2, treadH * i + treadH / 2, -l / 2 + treadL / 2 + i * (l / 5)]}>
                <boxGeometry args={[treadW, treadH, treadL]} />
                <meshStandardMaterial color={color} />
              </mesh>
            )
          })}
        </>
      )}

      {shape === 'wardrobe' && (
        <>
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w, h, l]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, h / 2, l / 2 + 0.02]}>
            <boxGeometry args={[w, h, 0.04]} />
            <meshStandardMaterial color="#b0a090" />
          </mesh>
        </>
      )}

      {isSelected && (
        <mesh position={[0, h, 0]}>
          <boxGeometry args={[w + 0.05, 0.02, l + 0.05]} />
          <meshBasicMaterial color="#e94560" transparent opacity={0.3} />
        </mesh>
      )}
    </group>
  )
}
