import { Html } from '@react-three/drei'
import type { RoomSpec } from '../types'

export interface VRRoomLabelProps {
  room: RoomSpec
  worldX: number
  worldZ: number
}

export function VRRoomLabel({ room, worldX, worldZ }: VRRoomLabelProps) {
  const area = room.w != null && room.h != null ? room.w * room.h : room.targetArea

  return (
    <Html
      position={[worldX, 2.8, worldZ]}
      center
      style={{
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          color: '#fff',
          fontSize: 24,
          fontWeight: 700,
          fontFamily: 'Inter, sans-serif',
          textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6)',
          letterSpacing: '0.05em',
          whiteSpace: 'nowrap',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}
      >
        {room.type.toUpperCase()} &middot; {area.toFixed(0)}m&sup2;
      </div>
    </Html>
  )
}
