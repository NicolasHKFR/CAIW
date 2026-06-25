import { useRef, useEffect, useMemo } from 'react'
import type { DesignDefinition, SunlightData } from '../types'

interface Props {
  definition: DesignDefinition
  sunlight: SunlightData
}

function sunlightColor(hours: number): string {
  if (hours <= 0) return '#1e3a5f'
  if (hours <= 2) return '#2563eb'
  if (hours <= 4) return '#eab308'
  return '#ef4444'
}

const STOPS = [
  { h: 0, color: '#1e3a5f', label: '0h' },
  { h: 2, color: '#2563eb', label: '2h' },
  { h: 4, color: '#eab308', label: '4h' },
  { h: 6, color: '#ef4444', label: '6h' },
]

export function SunlightMap({ definition, sunlight }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rooms = definition.rooms?.filter((r) => r.x != null && r.y != null && r.w != null && r.h != null) ?? []

  const hoursByRoomId = useMemo(
    () => new Map(sunlight.rooms.map((r) => [r.id, r.sunlight_hours])),
    [sunlight.rooms],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !rooms.length) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, w, h)

    const xs = rooms.map((r) => r.x!)
    const ys = rooms.map((r) => r.y!)
    const xe = rooms.map((r) => r.x! + r.w!)
    const ye = rooms.map((r) => r.y! + r.h!)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xe)
    const maxY = Math.max(...ye)

    const pad = 20
    const scale = Math.min(
      (w - pad * 2) / Math.max(maxX - minX, 1),
      (h - pad * 2) / Math.max(maxY - minY, 1),
    )

    const toX = (v: number) => pad + (v - minX) * scale
    const toY = (v: number) => pad + (v - minY) * scale

    ctx.fillStyle = '#0f3460'
    ctx.fillRect(0, 0, w, h)

    for (const room of rooms) {
      const hours = hoursByRoomId.get(room.id) ?? 0
      const rx = toX(room.x!)
      const ry = toY(room.y!)
      const rw = (room.w!) * scale
      const rh = (room.h!) * scale

      ctx.fillStyle = sunlightColor(hours)
      ctx.fillRect(rx, ry, rw, rh)

      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1
      ctx.strokeRect(rx, ry, rw, rh)

      ctx.fillStyle = '#fff'
      ctx.font = `${Math.max(10, scale * 0.45)}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(room.type.replace('_', ' ').toUpperCase(), rx + rw / 2, ry + rh / 2 - 4)
      ctx.font = `${Math.max(9, scale * 0.35)}px Inter, sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillText(`${hours.toFixed(1)}h`, rx + rw / 2, ry + rh / 2 + 14)
    }

    const legendY = h - 16
    const legendW = w - pad * 2
    const segW = legendW / (STOPS.length - 1)
    for (let i = 0; i < STOPS.length - 1; i++) {
      const grad = ctx.createLinearGradient(pad + i * segW, 0, pad + (i + 1) * segW, 0)
      grad.addColorStop(0, STOPS[i].color)
      grad.addColorStop(1, STOPS[i + 1].color)
      ctx.fillStyle = grad
      ctx.fillRect(pad + i * segW, legendY - 6, segW, 6)
    }
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '10px Inter, sans-serif'
    ctx.textAlign = 'center'
    for (const stop of STOPS) {
      const x = pad + (stop.h / 6) * legendW
      ctx.fillText(stop.label, x, legendY + 12)
    }
  }, [rooms, hoursByRoomId])

  if (!rooms.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#a0a0b0', fontSize: 13 }}>
        No positioned rooms to render
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: 300, borderRadius: 6 }}
    />
  )
}
