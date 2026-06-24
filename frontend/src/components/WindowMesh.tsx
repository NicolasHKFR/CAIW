import * as THREE from 'three'

const WIN_W = 1.2
const WIN_H = 1.2
const SILL_H = 0.9
const FRAME_W = 0.05
const GLASS_THICK = 0.02

const frameMat = new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.5 })
const glassMat = new THREE.MeshPhysicalMaterial({
  color: '#88ccff',
  transparent: true,
  opacity: 0.3,
  roughness: 0.1,
  metalness: 0.0,
  side: THREE.DoubleSide,
})

const bottomRail = new THREE.BoxGeometry(WIN_W + FRAME_W * 2, FRAME_W, FRAME_W)
const topRail = new THREE.BoxGeometry(WIN_W + FRAME_W * 2, FRAME_W, FRAME_W)
const stile = new THREE.BoxGeometry(FRAME_W, WIN_H, FRAME_W)
const glassGeo = new THREE.BoxGeometry(WIN_W, WIN_H, GLASS_THICK)

export interface WindowPlacement {
  worldX: number
  worldZ: number
  rotation: number
}

export function WindowMesh({ placement }: { placement: WindowPlacement }) {
  return (
    <group position={[placement.worldX, 0, placement.worldZ]} rotation={[0, placement.rotation, 0]}>
      <mesh geometry={bottomRail} position={[0, SILL_H, 0]} material={frameMat} />
      <mesh geometry={topRail} position={[0, SILL_H + WIN_H, 0]} material={frameMat} />
      <mesh geometry={stile} position={[-WIN_W / 2, SILL_H + WIN_H / 2, 0]} material={frameMat} />
      <mesh geometry={stile} position={[WIN_W / 2, SILL_H + WIN_H / 2, 0]} material={frameMat} />
      <mesh geometry={glassGeo} position={[0, SILL_H + WIN_H / 2, 0]} material={glassMat} />
      {WIN_W > 1.5 && (
        <>
          <mesh geometry={new THREE.BoxGeometry(FRAME_W, WIN_H, FRAME_W)} position={[0, SILL_H + WIN_H / 2, 0]} material={frameMat} />
          <mesh geometry={new THREE.BoxGeometry(WIN_W, FRAME_W, FRAME_W)} position={[0, SILL_H + WIN_H / 2, 0]} material={frameMat} />
        </>
      )}
    </group>
  )
}
