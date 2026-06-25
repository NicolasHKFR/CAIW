import { useState, useRef } from 'react'
import { useXRInputSourceState, useXRInputSourceEvent } from '@react-three/xr'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'

export interface MeasureToolProps {
  enabled: boolean
}

function computeFloorHit(
  origin: THREE.Vector3,
  quaternion: THREE.Quaternion,
): THREE.Vector3 | null {
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion)
  if (dir.y >= 0) return null
  const t = -origin.y / dir.y
  if (t < 0.1) return null
  return new THREE.Vector3().copy(origin).addScaledVector(dir, t)
}

export function MeasureTool({ enabled }: MeasureToolProps) {
  const leftController = useXRInputSourceState('controller', 'left')
  const [points, setPoints] = useState<THREE.Vector3[]>([])
  const originRef = useRef(new THREE.Vector3())
  const quatRef = useRef(new THREE.Quaternion())
  const controllerObj = leftController?.object

  useXRInputSourceEvent(
    leftController?.inputSource ?? 'all',
    'selectstart',
    () => {
      if (!enabled || !controllerObj) return
      originRef.current.setFromMatrixPosition(controllerObj.matrixWorld)
      quatRef.current.setFromRotationMatrix(controllerObj.matrixWorld)
      const hit = computeFloorHit(originRef.current, quatRef.current)
      if (!hit) return

      setPoints((prev) => {
        if (prev.length >= 2) {
          return [hit]
        }
        return [...prev, hit]
      })
    },
    [enabled, controllerObj],
  )

  const distance =
    points.length === 2
      ? points[0].distanceTo(points[1])
      : null

  const midpoint =
    points.length === 2
      ? new THREE.Vector3()
          .addVectors(points[0], points[1])
          .multiplyScalar(0.5)
      : null

  return (
    <>
      {points.map((p, i) => (
        <mesh key={i} position={[p.x, 0.02, p.z]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color={i === 0 ? '#ff6644' : '#44aaff'} />
        </mesh>
      ))}

      {points.length === 2 && (
        <>
          <Line
            points={points}
            color="#ffdd44"
            lineWidth={2}
            transparent
            opacity={0.7}
          />

          {midpoint && (
            <Html position={[midpoint.x, 0.5, midpoint.z]} center>
              <div
                style={{
                  background: 'rgba(0,0,0,0.7)',
                  color: '#ffdd44',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: 'Inter, sans-serif',
                  whiteSpace: 'nowrap',
                  border: '1px solid rgba(255,221,68,0.3)',
                  backdropFilter: 'blur(4px)',
                }}
              >
                {(distance ?? 0).toFixed(2)}m
              </div>
            </Html>
          )}
        </>
      )}
    </>
  )
}
