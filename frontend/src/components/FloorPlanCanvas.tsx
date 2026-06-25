import { useRef, useEffect, useCallback, useState } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import type { RoomBounds } from '../store/canvasStore'
import { useProjectStore } from '../store/projectStore'
import { useToastStore } from '../store/toastStore'
import { api } from '../api'
import type { RoomSpec, DesignDefinition } from '../types'
import styles from './FloorPlanCanvas.module.css'
import { hashColor } from '../constants'

function screenToMeters(
  screenX: number, screenY: number,
  canvas: HTMLCanvasElement,
  scale: number, panX: number, panY: number
) {
  const rect = canvas.getBoundingClientRect()
  return {
    mx: (screenX - rect.left - panX) / scale,
    my: (screenY - rect.top - panY) / scale,
  }
}

function metersToScreen(
  mx: number, my: number,
  canvas: HTMLCanvasElement,
  scale: number, panX: number, panY: number
) {
  const rect = canvas.getBoundingClientRect()
  return {
    sx: mx * scale + panX + rect.left,
    sy: my * scale + panY + rect.top,
  }
}

function findRoomAt(
  rooms: RoomSpec[], mx: number, my: number
): RoomSpec | null {
  for (let i = rooms.length - 1; i >= 0; i--) {
    const r = rooms[i]
    if (r.x != null && r.y != null && r.w != null && r.h != null) {
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        return r
      }
    }
  }
  return null
}

function snapValue(v: number, grid: number) {
  return Math.round(v / grid) * grid
}

function computeDiffs(base: DesignDefinition, compare: DesignDefinition) {
  const baseMap = new Map(base.rooms.map((r) => [r.id, r]))
  const compareMap = new Map(compare.rooms.map((r) => [r.id, r]))
  const allIds = new Set([...baseMap.keys(), ...compareMap.keys()])
  const diffs: { id: string; type: string; areaDiff: number; moved: boolean }[] = []
  for (const id of allIds) {
    const a = baseMap.get(id)
    const b = compareMap.get(id)
    if (a && b) {
      const areaDiff = (b.w ?? 0) * (b.h ?? 0) - (a.w ?? 0) * (a.h ?? 0)
      const moved = (a.x !== b.x || a.y !== b.y)
      diffs.push({ id, type: b.type, areaDiff: Math.round(areaDiff * 100) / 100, moved })
    } else if (b) {
      diffs.push({ id, type: b.type, areaDiff: (b.w ?? 0) * (b.h ?? 0), moved: false })
    }
  }
  return diffs
}

export function FloorPlanCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isPanning = useRef(false)
  const wasDragged = useRef(false)
  const isDraggingRoom = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const dragStartPos = useRef({ mx: 0, my: 0 })
  const localRooms = useRef<RoomSpec[] | null>(null)
  const [infoPos, setInfoPos] = useState({ x: 0, y: 0 })
  const { addToast } = useToastStore()

  const {
    scale, panX, panY, gridSize,
    selectedRoomId, hoveredRoomId, compareVersion, selectedFloor,
    setScale, setPan, zoomIn, zoomOut,
    selectRoom, hoverRoom, resetView, setCompareVersion, fitToContent, setSelectedFloor,
    pushUndo, undo, redo,
  } = useCanvasStore()
  const { designs, activeProjectId, updateDesignDefinition } = useProjectStore()

  const activeDesign = designs
    .filter((d) => d.project_id === activeProjectId)
    .sort((a, b) => b.version - a.version)[0] ?? null

  const compareDesign = compareVersion != null
    ? designs.find((d) => d.version === compareVersion)
    : null

  const definition: DesignDefinition | null =
    activeDesign?.json_definition ?? null

  const selectedRoom = definition?.rooms.find((r) => r.id === selectedRoomId) ?? null
  const hoveredRoom = definition?.rooms.find((r) => r.id === hoveredRoomId) ?? null

  const version = activeDesign?.version ?? 0

  const diffs = definition && compareDesign?.json_definition
    ? computeDiffs(compareDesign.json_definition, definition)
    : null

  const drawContent = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, rooms?: RoomSpec[]) => {
    drawGrid(ctx, w, h, scale, panX, panY, gridSize)

    const roomsToDraw = (rooms ?? definition?.rooms ?? []).filter((r) => r.floor === selectedFloor)

    if (!definition) {
      ctx.fillStyle = '#a0a0b0'
      ctx.font = '14px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Generate a design to see the floor plan', w / 2, h / 2)
      return
    }

    if (diffs && compareDesign) {
      for (const room of roomsToDraw) {
        const diff = diffs.find((d) => d.id === room.id)
        const isHovered = room.id === hoveredRoomId
        const isSelected = room.id === selectedRoomId
        drawRoom(ctx, room, scale, panX, panY, isHovered, isSelected, diff)
      }
    } else {
      for (const room of roomsToDraw) {
        const isHovered = room.id === hoveredRoomId
        const isSelected = room.id === selectedRoomId
        drawRoom(ctx, room, scale, panX, panY, isHovered, isSelected)
      }
    }
  }, [definition, scale, panX, panY, gridSize, hoveredRoomId, selectedRoomId, diffs, compareDesign, selectedFloor])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const container = containerRef.current
    if (!container) return

    canvas.width = container.clientWidth
    canvas.height = container.clientHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = '#f5f0eb'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    drawContent(ctx, canvas.width, canvas.height)
  }, [drawContent])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const handleResize = () => draw()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [draw])

  useEffect(() => {
    if (!definition?.rooms?.length) return
    const container = containerRef.current
    if (!container) return
    const currentFloorRooms = definition.rooms.filter((r) => r.floor === selectedFloor)
    const bounds: RoomBounds[] = currentFloorRooms
      .filter((r): r is RoomSpec & { x: number; y: number; w: number; h: number } =>
        r.x != null && r.y != null && r.w != null && r.h != null
      )
      .map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }))
    if (bounds.length) {
      fitToContent(bounds, container.clientWidth, container.clientHeight)
    }
  }, [activeDesign?.id, selectedFloor])

  const handleExportPng = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !definition) return
    const offscreen = document.createElement('canvas')
    const exportScale = 2
    offscreen.width = canvas.width * exportScale
    offscreen.height = canvas.height * exportScale
    const ctx = offscreen.getContext('2d')
    if (!ctx) return
    ctx.scale(exportScale, exportScale)
    ctx.fillStyle = '#f5f0eb'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    drawContent(ctx, canvas.width, canvas.height)
    offscreen.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `floorplan_${definition.buildingType}_${definition.style}.png`
      a.click()
      URL.revokeObjectURL(url)
      addToast({ message: 'Floor plan exported as PNG', type: 'success' })
    })
  }, [definition, drawContent, addToast])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      if (e.deltaY > 0) zoomOut()
      else zoomIn()
    },
    [zoomIn, zoomOut]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const canvas = canvasRef.current
      if (!canvas || !definition) {
        isPanning.current = true
        wasDragged.current = false
        lastPos.current = { x: e.clientX, y: e.clientY }
        return
      }

      const { mx, my } = screenToMeters(e.clientX, e.clientY, canvas, scale, panX, panY)
      const room = findRoomAt(definition.rooms, mx, my)

      if (room && room.id === selectedRoomId) {
        isDraggingRoom.current = true
        wasDragged.current = false
        dragStartPos.current = { mx, my }
        lastPos.current = { x: e.clientX, y: e.clientY }
        localRooms.current = definition.rooms.map((r) => ({ ...r }))
        pushUndo(definition.rooms)
        return
      }

      isPanning.current = true
      wasDragged.current = false
      lastPos.current = { x: e.clientX, y: e.clientY }
    },
    [scale, panX, panY, definition, selectedRoomId]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return

      if (isDraggingRoom.current && localRooms.current && definition) {
        const dx = (e.clientX - lastPos.current.x) / scale
        const dy = (e.clientY - lastPos.current.y) / scale
        if (Math.abs(e.clientX - lastPos.current.x) > 2 || Math.abs(e.clientY - lastPos.current.y) > 2) {
          wasDragged.current = true
        }
        lastPos.current = { x: e.clientX, y: e.clientY }

        const room = localRooms.current.find((r) => r.id === selectedRoomId)
        if (room && room.x != null && room.y != null) {
          let nx = room.x + dx
          let ny = room.y + dy
          if (gridSize > 0) {
            nx = snapValue(nx, gridSize)
            ny = snapValue(ny, gridSize)
          }
          room.x = Math.max(0, nx)
          room.y = Math.max(0, ny)
        }

        const ctx = canvas.getContext('2d')
        if (ctx) {
          const container = containerRef.current
          if (container) {
            canvas.width = container.clientWidth
            canvas.height = container.clientHeight
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.fillStyle = '#f5f0eb'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          drawContent(ctx, canvas.width, canvas.height, localRooms.current)
        }
        return
      }

      if (isPanning.current) {
        const dx = e.clientX - lastPos.current.x
        const dy = e.clientY - lastPos.current.y
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          wasDragged.current = true
        }
        lastPos.current = { x: e.clientX, y: e.clientY }
        setPan(panX + dx, panY + dy)
        return
      }

      if (!definition) return
      const { mx, my } = screenToMeters(e.clientX, e.clientY, canvas, scale, panX, panY)
      const room = findRoomAt(definition.rooms, mx, my)
      hoverRoom(room?.id ?? null)
    },
    [panX, panY, setPan, scale, definition, hoverRoom, selectedRoomId, drawContent, gridSize]
  )

  const handleMouseUp = useCallback(
    async (e: React.MouseEvent) => {
      if (isDraggingRoom.current && wasDragged.current && localRooms.current && definition && activeDesign && activeProjectId) {
        const updatedDef: DesignDefinition = {
          ...definition,
          rooms: localRooms.current.map((r) => ({ ...r })),
        }
        updateDesignDefinition(activeDesign.id, updatedDef)
        try {
          const design = await api.updateDesign(activeProjectId, version, updatedDef)
          if (design) {
            addToast({ message: `Room positions saved (v${version})`, type: 'success' })
          }
        } catch {
          addToast({ message: 'Failed to save room positions', type: 'error' })
        }
        localRooms.current = null
      }

      if (isDraggingRoom.current && !wasDragged.current) {
        isDraggingRoom.current = false
        return
      }

      if (isPanning.current && !wasDragged.current) {
        const canvas = canvasRef.current
        if (canvas && definition) {
          const { mx, my } = screenToMeters(e.clientX, e.clientY, canvas, scale, panX, panY)
          const room = findRoomAt(definition.rooms, mx, my)
          selectRoom(room?.id === selectedRoomId ? null : room?.id ?? null)
          if (room) {
            setInfoPos({ x: e.clientX - canvas.getBoundingClientRect().left, y: e.clientY - canvas.getBoundingClientRect().top })
          }
        }
      }

      isDraggingRoom.current = false
      isPanning.current = false
    },
    [scale, panX, panY, definition, selectedRoomId, selectRoom, activeDesign, activeProjectId, version, addToast]
  )

  const handleCompareChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    setCompareVersion(val ? Number(val) : null)
  }

  const handleUndo = useCallback(() => {
    const rooms = undo()
    if (!rooms || !definition || !activeDesign || !activeProjectId) return
    const updatedDef: DesignDefinition = { ...definition, rooms }
    updateDesignDefinition(activeDesign.id, updatedDef)
    api.updateDesign(activeProjectId, version, updatedDef).catch(() => {
      addToast({ message: 'Failed to undo', type: 'error' })
    })
  }, [definition, activeDesign, activeProjectId, version, undo, updateDesignDefinition, addToast])

  const handleRedo = useCallback(() => {
    const rooms = redo()
    if (!rooms || !definition || !activeDesign || !activeProjectId) return
    const updatedDef: DesignDefinition = { ...definition, rooms }
    updateDesignDefinition(activeDesign.id, updatedDef)
    api.updateDesign(activeProjectId, version, updatedDef).catch(() => {
      addToast({ message: 'Failed to redo', type: 'error' })
    })
  }, [definition, activeDesign, activeProjectId, version, redo, updateDesignDefinition, addToast])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo])

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarLabel}>
          {definition ? `${definition.buildingType} · ${definition.style}` : 'Floor Plan'}
        </span>
        <div className={styles.toolbarActions}>
          {definition && (() => {
            const floors = [...new Set(definition.rooms.map((r) => r.floor))].sort((a, b) => a - b)
            if (floors.length <= 1) return null
            return (
              <div className={styles.floorBar}>
                {floors.map((f) => (
                  <button
                    key={f}
                    className={`${styles.floorBtn} ${f === selectedFloor ? styles.floorActive : ''}`}
                    onClick={() => setSelectedFloor(f)}
                  >
                    {f === 0 ? 'Basement' : f === 1 ? 'Ground' : `Floor ${f}`}
                  </button>
                ))}
              </div>
            )
          })()}
          {designs.length > 1 && (
            <select className={styles.compareSelect} value={compareVersion ?? ''} onChange={handleCompareChange}>
              <option value="">No compare</option>
              {designs.filter((d) => d.version !== version).map((d) => (
                <option key={d.version} value={d.version}>
                  v{d.version}
                </option>
              ))}
            </select>
          )}
          <button onClick={handleUndo} className={styles.toolBtn} title="Undo move (Ctrl+Z)">
            ↩
          </button>
          <button onClick={handleRedo} className={styles.toolBtn} title="Redo move (Ctrl+Shift+Z)">
            ↪
          </button>
          <button onClick={() => selectRoom(null)} className={styles.toolBtn} title="Deselect room">
            Deselect
          </button>
          {definition && activeProjectId && (
            <>
              <button onClick={handleExportPng} className={styles.toolBtn} title="Export as PNG">
                PNG
              </button>
              <a
                href={api.exportPdf(activeProjectId, version)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.toolBtn}
                title="Export as PDF"
              >
                PDF
              </a>
            </>
          )}
          <button onClick={resetView} className={styles.toolBtn} title="Reset view">
            Reset
          </button>
          <button onClick={zoomIn} className={styles.toolBtn} title="Zoom in">
            +
          </button>
          <button onClick={zoomOut} className={styles.toolBtn} title="Zoom out">
            −
          </button>
          <span className={styles.scaleLabel}>{scale}px/m</span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { isPanning.current = false; isDraggingRoom.current = false; hoverRoom(null) }}
      />
      {selectedRoom && (
        <div
          className={styles.infoPanel}
          style={{ left: Math.min(infoPos.x, (containerRef.current?.clientWidth ?? 800) - 220), top: Math.min(infoPos.y, (containerRef.current?.clientHeight ?? 600) - 200) }}
        >
          <div className={styles.infoHeader}>{selectedRoom.type.replace('_', ' ').toUpperCase()}</div>
          <div className={styles.infoRow}><span>ID</span><span>{selectedRoom.id}</span></div>
          <div className={styles.infoRow}><span>Area</span><span>{selectedRoom.targetArea}m²</span></div>
          {selectedRoom.w != null && selectedRoom.h != null && (
            <div className={styles.infoRow}><span>Size</span><span>{selectedRoom.w.toFixed(1)}×{selectedRoom.h.toFixed(1)}m</span></div>
          )}
          <div className={styles.infoRow}><span>Version</span><span>v{version}</span></div>
          {diffs && (() => {
            const diff = diffs.find((d) => d.id === selectedRoom.id)
            if (!diff) return null
            return (
              <div className={styles.infoRow}>
                <span>vs v{compareVersion}</span>
                <span style={{ color: diff.areaDiff > 0 ? '#16a34a' : diff.areaDiff < 0 ? '#dc2626' : '#a0a0b0' }}>
                  {diff.areaDiff > 0 ? '+' : ''}{diff.areaDiff}m²
                  {diff.moved ? ' ↕' : ''}
                </span>
              </div>
            )
          })()}
          {selectedRoom.furniture.length > 0 && (
            <>
              <div className={styles.infoDivider} />
              <div className={styles.infoSubheader}>Furniture ({selectedRoom.furniture.length})</div>
              {selectedRoom.furniture.map((f) => (
                <div key={f.id} className={styles.infoRow}>
                  <span>{f.name}</span>
                  <span>{f.width.toFixed(1)}×{f.length.toFixed(1)}m</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number,
  panX: number,
  panY: number,
  gridSize: number
) {
  const step = gridSize * scale
  if (step < 4) return

  ctx.strokeStyle = '#ddd8d0'
  ctx.lineWidth = 0.5

  const startX = panX % step
  const startY = panY % step

  for (let x = startX; x < width; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = startY; y < height; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
}

function drawRoom(
  ctx: CanvasRenderingContext2D,
  room: RoomSpec,
  scale: number,
  panX: number,
  panY: number,
  isHovered: boolean,
  isSelected: boolean,
  diff?: { areaDiff: number; moved: boolean } | null,
) {
  if (room.x == null || room.y == null || room.w == null || room.h == null) return

  const x = room.x * scale + panX
  const y = room.y * scale + panY
  const w = room.w * scale
  const h = room.h * scale
  const isStairs = room.type === 'stairs'

  if (diff && Math.abs(diff.areaDiff) > 0.1) {
    ctx.fillStyle = diff.areaDiff > 0 ? 'rgba(22, 163, 74, 0.15)' : 'rgba(220, 38, 38, 0.15)'
  } else if (isStairs) {
    ctx.fillStyle = isSelected ? '#d4e8ff' : isHovered ? '#e8f0e8' : '#e0d8d0'
  } else if (diff && diff.moved) {
    ctx.fillStyle = 'rgba(37, 99, 235, 0.1)'
  } else {
    ctx.fillStyle = isSelected ? '#d4e8ff' : isHovered ? '#e8f0e8' : hashColor(room.id)
  }
  ctx.fillRect(x, y, w, h)

  if (isStairs) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    ctx.strokeStyle = '#999'
    ctx.lineWidth = 1
    const step = Math.max(8, scale * 0.5)
    for (let i = 0; i < w + h; i += step) {
      ctx.beginPath()
      ctx.moveTo(x + i, y)
      ctx.lineTo(x, y + i)
      ctx.stroke()
    }
    ctx.restore()
  }

  ctx.strokeStyle = isSelected ? '#2563eb' : isHovered ? '#16a34a' : '#333'
  ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 2
  ctx.strokeRect(x, y, w, h)

  if (diff && diff.moved) {
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.5)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, y, w, h)
    ctx.setLineDash([])
  }

  ctx.fillStyle = '#333'
  ctx.font = `${Math.max(10, scale * 0.4)}px Inter, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const label = isStairs && room.connectedFloor != null
    ? `STAIRS → F${room.connectedFloor}`
    : room.type.replace('_', ' ').toUpperCase()
  ctx.fillText(label, x + w / 2, y + h / 2 - 6)

  ctx.font = `${Math.max(9, scale * 0.35)}px Inter, sans-serif`
  ctx.fillStyle = '#666'
  ctx.fillText(`${room.w.toFixed(1)}×${room.h.toFixed(1)}m`, x + w / 2, y + h / 2 + 10)

  if (diff && Math.abs(diff.areaDiff) > 0.1) {
    const label = `${diff.areaDiff > 0 ? '+' : ''}${diff.areaDiff}m²`
    ctx.font = `${Math.max(9, scale * 0.35)}px Inter, sans-serif`
    ctx.fillStyle = diff.areaDiff > 0 ? '#16a34a' : '#dc2626'
    ctx.fillText(label, x + w / 2, y + h / 2 + 24)
  }

  for (const f of room.furniture) {
    const fx = (room.x + f.x) * scale + panX
    const fy = (room.y + f.y) * scale + panY
    const fw = f.width * scale
    const fh = f.length * scale

    ctx.fillStyle = '#8b7355'
    ctx.fillRect(fx, fy, fw, fh)
    ctx.strokeStyle = '#555'
    ctx.lineWidth = 1
    ctx.strokeRect(fx, fy, fw, fh)

    if (scale > 20) {
      ctx.fillStyle = '#fff'
      ctx.font = `${Math.max(8, scale * 0.3)}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(f.name, fx + fw / 2, fy + fh / 2)
    }
  }
}
