import { useState, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Sphere, Line, Text } from '@react-three/drei'
import * as THREE from 'three'
import type { DesignDefinition } from '../types'

interface Props {
  definition: DesignDefinition
}

function SunSphere({ hour }: { hour: number }) {
  const ref = useRef<THREE.Mesh>(null)
  const angle = ((hour - 6) / 12) * Math.PI
  const radius = 5
  const x = Math.cos(angle) * radius
  const y = Math.sin(angle) * radius + 1.5

  useFrame(() => {
    if (ref.current) {
      ref.current.position.x = x
      ref.current.position.y = Math.max(y, 0.5)
    }
  })

  const sunColor = hour >= 6 && hour <= 18 ? '#fbbf24' : '#f97316'

  return (
    <mesh ref={ref}>
      <Sphere args={[0.4, 16, 16]}>
        <meshStandardMaterial color={sunColor} emissive={sunColor} emissiveIntensity={0.5} />
      </Sphere>
      <pointLight intensity={0.8} distance={10} color={sunColor} />
    </mesh>
  )
}

function BuildingBox({ definition }: { definition: DesignDefinition }) {
  const rooms = definition.rooms?.filter((r) => r.x != null && r.y != null && r.w != null && r.h != null) ?? []
  if (!rooms.length) return null

  const xs = rooms.map((r) => r.x!)
  const ys = rooms.map((r) => r.y!)
  const xe = rooms.map((r) => r.x! + r.w!)
  const ye = rooms.map((r) => r.y! + r.h!)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const bw = Math.max(...xe) - minX
  const bh = Math.max(...ye) - minY

  return (
    <mesh position={[bw / 2 - 2.5, 0.5, bh / 2 - 2]}>
      <boxGeometry args={[bw, 1, bh]} />
      <meshStandardMaterial color="#16213e" transparent opacity={0.8} />
    </mesh>
  )
}

function ArcPath() {
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= 24; i++) {
    const angle = ((i - 6) / 12) * Math.PI
    const radius = 5
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius + 1.5
    points.push(new THREE.Vector3(x, Math.max(y, 0.3), 0))
  }
  return <Line points={points} color="#4a4a6a" lineWidth={1} transparent opacity={0.4} />
}

function Scene({ definition, hour }: { definition: DesignDefinition; hour: number }) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 10, 5]} intensity={0.5} />
      <BuildingBox definition={definition} />
      <SunSphere hour={hour} />
      <ArcPath />
      <Text position={[0, -1.5, 0]} fontSize={0.3} color="#a0a0b0">
        {hour.toFixed(1)}h
      </Text>
      <OrbitControls enableZoom={true} enablePan={true} target={[0, 1, 0]} />
    </>
  )
}

export function SunArc3D({ definition }: Props) {
  const [hour, setHour] = useState(12)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ height: 300, borderRadius: 6, overflow: 'hidden' }}>
        <Canvas camera={{ position: [8, 4, 8], fov: 50 }}>
          <Scene definition={definition} hour={hour} />
        </Canvas>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
        <span style={{ color: '#a0a0b0', fontSize: 11 }}>0h</span>
        <input
          type="range"
          min={0}
          max={24}
          step={0.5}
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          style={{ flex: 1, accentColor: '#e94560' }}
        />
        <span style={{ color: '#a0a0b0', fontSize: 11 }}>24h</span>
      </div>
    </div>
  )
}
