import * as THREE from 'three'

const DOOR_W = 0.9
const DOOR_H = 2.1
const FRAME_THICK = 0.05
const LEAF_THICK = 0.04
const HINGE_ANGLE = Math.PI / 6

const jambGeo = new THREE.BoxGeometry(FRAME_THICK, DOOR_H, FRAME_THICK)
const headerGeo = new THREE.BoxGeometry(DOOR_W + FRAME_THICK * 2, FRAME_THICK, FRAME_THICK)
const leafGeo = new THREE.BoxGeometry(DOOR_W, DOOR_H, LEAF_THICK)

const frameMat = new THREE.MeshStandardMaterial({ color: '#5c3a1e', roughness: 0.8 })
const leafMat = new THREE.MeshStandardMaterial({ color: '#8b6914', roughness: 0.6 })

export interface DoorPlacement {
  worldX: number
  worldZ: number
  rotation: number
}

export function DoorMesh({ placement }: { placement: DoorPlacement }) {
  return (
    <group position={[placement.worldX, 0, placement.worldZ]} rotation={[0, placement.rotation, 0]}>
      <group>
        <mesh geometry={jambGeo} position={[-DOOR_W / 2, DOOR_H / 2, 0]} material={frameMat} />
        <mesh geometry={jambGeo} position={[DOOR_W / 2, DOOR_H / 2, 0]} material={frameMat} />
        <mesh geometry={headerGeo} position={[0, DOOR_H, 0]} material={frameMat} />
      </group>
      <group position={[-DOOR_W / 2, 0, 0]}>
        <group rotation={[0, HINGE_ANGLE, 0]}>
          <mesh
            geometry={leafGeo}
            position={[DOOR_W / 2, DOOR_H / 2, 0]}
            material={leafMat}
            castShadow
          />
        </group>
      </group>
    </group>
  )
}
