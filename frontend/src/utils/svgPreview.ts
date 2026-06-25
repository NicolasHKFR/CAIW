import type { DesignDefinition } from '../types'
import { hashColor } from '../constants'

export function renderSvgPreview(json: DesignDefinition, floor?: number): string {
  let rooms = json.rooms?.filter((r) => r.x != null && r.y != null && r.w != null && r.h != null) ?? []
  if (floor != null) {
    rooms = rooms.filter((r) => r.floor === floor)
  }
  if (!rooms.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><text x="200" y="150" text-anchor="middle" fill="#a0a0b0" font-size="14">No rooms with positions</text></svg>'

  const xs = rooms.map((r) => r.x!)
  const ys = rooms.map((r) => r.y!)
  const xe = rooms.map((r) => r.x! + r.w!)
  const ye = rooms.map((r) => r.y! + r.h!)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xe)
  const maxY = Math.max(...ye)

  const pad = 30
  const svgW = 500
  const svgH = 400
  const scale = Math.min(
    (svgW - pad * 2) / Math.max(maxX - minX, 1),
    (svgH - pad * 2) / Math.max(maxY - minY, 1),
  )

  const toX = (v: number) => pad + (v - minX) * scale
  const toY = (v: number) => pad + (v - minY) * scale

  const lines: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`]
  lines.push(`<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#f5f0eb"/>`)

  const walls: { x1: number; y1: number; x2: number; y2: number }[] = []

  for (const room of rooms) {
    const rx1 = toX(room.x!)
    const ry1 = toY(room.y!)
    const rx2 = toX(room.x! + room.w!)
    const ry2 = toY(room.y! + room.h!)
    const color = hashColor(room.id)

    lines.push(`<rect x="${rx1}" y="${ry1}" width="${rx2 - rx1}" height="${ry2 - ry1}" fill="${color}" stroke="none"/>`)

    walls.push(
      { x1: rx1, y1: ry1, x2: rx2, y2: ry1 },
      { x1: rx1, y1: ry2, x2: rx2, y2: ry2 },
      { x1: rx1, y1: ry1, x2: rx1, y2: ry2 },
      { x1: rx2, y1: ry1, x2: rx2, y2: ry2 },
    )

    for (const f of room.furniture ?? []) {
      const fx = toX(room.x! + f.x)
      const fy = toY(room.y! + f.y)
      const fw = f.width * scale
      const fh = f.length * scale
      lines.push(`<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="#8b7355" stroke="#555" stroke-width="1"/>`)
    }

    const cx = (rx1 + rx2) / 2
    const cy = (ry1 + ry2) / 2
    const fontSize = Math.max(10, scale * 0.45)

    lines.push(`<text x="${cx}" y="${cy - fontSize * 0.3}" text-anchor="middle" fill="#333" font-size="${fontSize}" font-family="Inter,sans-serif" font-weight="600">${room.type.replace('_', ' ').toUpperCase()}</text>`)
    lines.push(`<text x="${cx}" y="${cy + fontSize * 0.5}" text-anchor="middle" fill="#666" font-size="${Math.max(9, scale * 0.35)}" font-family="Inter,sans-serif">${room.w!.toFixed(1)}×${room.h!.toFixed(1)}m</text>`)
  }

  const drawn = new Set<string>()
  for (const w of walls) {
    const key = `${w.x1},${w.y1},${w.x2},${w.y2}`
    if (drawn.has(key)) continue
    drawn.add(key)
    lines.push(`<line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="#555" stroke-width="3"/>`)
  }

  lines.push('</svg>')
  return lines.join('\n')
}
