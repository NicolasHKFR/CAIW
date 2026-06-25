import { useRef, useEffect, useState } from 'react'
import type { DesignDefinition } from '../types'

interface Props {
  definition: DesignDefinition
}

function deviationColor(deviation: number): string {
  const abs = Math.abs(deviation)
  if (abs <= 0.1) return '#22c55e'
  if (abs <= 0.3) return '#eab308'
  return '#ef4444'
}

export function SpaceHeatmap({ definition }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)

  const rooms = definition.rooms?.filter((r) => r.x != null && r.y != null && r.w != null && r.h != null) ?? []

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
      const actual = room.w! * room.h!
      const target = room.targetArea
      const deviation = target > 0 ? (actual - target) / target : 0
      const rx = toX(room.x!)
      const ry = toY(room.y!)
      const rw = (room.w!) * scale
      const rh = (room.h!) * scale

      ctx.fillStyle = deviationColor(deviation)
      ctx.globalAlpha = 0.8
      ctx.fillRect(rx, ry, rw, rh)
      ctx.globalAlpha = 1

      ctx.strokeStyle = 'rgba(255,255,255,0.2)'
      ctx.lineWidth = 1
      ctx.strokeRect(rx, ry, rw, rh)

      ctx.fillStyle = '#fff'
      ctx.font = `${Math.max(10, scale * 0.45)}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(room.type.replace('_', ' ').toUpperCase(), rx + rw / 2, ry + rh / 2 - 4)

      const pct = deviation * 100
      const sign = pct >= 0 ? '+' : ''
      ctx.font = `${Math.max(9, scale * 0.35)}px Inter, sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillText(`${sign}${pct.toFixed(0)}%`, rx + rw / 2, ry + rh / 2 + 14)
    }
  }, [rooms])

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !rooms.length) { setTooltip(null); return }
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

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
      (canvas.clientWidth - pad * 2) / Math.max(maxX - minX, 1),
      (canvas.clientHeight - pad * 2) / Math.max(maxY - minY, 1),
    )

    for (const room of rooms) {
      const rx = pad + (room.x! - minX) * scale
      const ry = pad + (room.y! - minY) * scale
      const rw = room.w! * scale
      const rh = room.h! * scale
      if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) {
        const actual = room.w! * room.h!
        const target = room.targetArea
        const deviation = target > 0 ? (actual - target) / target : 0
        const pct = (deviation * 100).toFixed(0)
        const sign = deviation >= 0 ? '+' : ''
        setTooltip({
          x: e.clientX - rect.left + 10,
          y: e.clientY - rect.top - 10,
          text: `${room.type.replace('_', ' ')} · Target ${target}m² · Actual ${actual.toFixed(1)}m² (${sign}${pct}%)`,
        })
        return
      }
    }
    setTooltip(null)
  }

  if (!rooms.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#a0a0b0', fontSize: 13 }}>
        No positioned rooms to render
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        style={{ width: '100%', height: 300, borderRadius: 6, cursor: 'pointer' }}
      />
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
            background: '#1a1a2e',
            color: '#eaeaea',
            padding: '6px 10px',
            borderRadius: 4,
            fontSize: 12,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            border: '1px solid rgba(255,255,255,0.1)',
            zIndex: 10,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
