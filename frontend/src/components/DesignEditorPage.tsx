import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { Design, DesignDefinition, RoomSpec } from '../types'
import { useToastStore } from '../store/toastStore'
import { useProjectStore } from '../store/projectStore'
import styles from './DesignEditorPage.module.css'

const ROOM_COLORS = [
  '#e8dcc8', '#c8d8e8', '#d4e8c8', '#f0d0d0', '#d0d0f0', '#f0e8c0', '#e0e0e0',
]

function hashColor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return ROOM_COLORS[Math.abs(hash) % ROOM_COLORS.length]
}

function renderSvgPreview(json: DesignDefinition, floor?: number): string {
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

function inferTsType(val: unknown, depth = 0): string {
  if (val === null || val === undefined) return 'any'
  if (typeof val === 'string') return 'string'
  if (typeof val === 'number') return 'number'
  if (typeof val === 'boolean') return 'boolean'
  if (Array.isArray(val)) {
    if (val.length === 0) return 'any[]'
    const elemTypes = [...new Set(val.map((v) => inferTsType(v, depth + 1)))]
    const joined = elemTypes.join(' | ')
    return elemTypes.length === 1 ? `${joined}[]` : `(${joined})[]`
  }
  if (typeof val === 'object') {
    if (depth > 2) return 'Record<string, any>'
    const props = Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `  ${k}: ${inferTsType(v, depth + 1)}`)
      .join('\n')
    return `{\n${props}\n}`
  }
  return 'any'
}

function jsonToTypescript(def: DesignDefinition): string {
  const generated = new Map<string, string>()

  function extractInterfaces(obj: unknown, name: string): string {
    if (!obj || typeof obj !== 'object') return 'any'
    const entries = Object.entries(obj as Record<string, unknown>)
    const props: string[] = []
    for (const [key, val] of entries) {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
        const childName = name + '_' + key.charAt(0).toUpperCase() + key.slice(1).replace(/s$/, '')
        const childType = extractInterfaces(val[0], childName)
        if (childType !== 'any') {
          generated.set(childName, childType)
          props.push(`  ${key}: ${childName}[]`)
        } else {
          props.push(`  ${key}: any[]`)
        }
      } else {
        props.push(`  ${key}: ${inferTsType(val)}`)
      }
    }
    return props.join('\n')
  }

  const defProps = extractInterfaces(def, 'DesignDefinition')
  if (defProps !== 'any') {
    generated.set('DesignDefinition', defProps)
  }

  const lines: string[] = []
  for (const [name, props] of generated) {
    lines.push(`interface ${name} {`)
    lines.push(props)
    lines.push('}\n')
  }

  return lines.join('\n').trimEnd()
}

export function DesignEditorPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const toast = useToastStore((s) => s.addToast)

  const projectId = searchParams.get('project') ?? ''
  const versionStr = searchParams.get('version') ?? ''

  const [design, setDesign] = useState<Design | null>(null)
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(true)
  const [jsonText, setJsonText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [previewSvg, setPreviewSvg] = useState('')
  const [previewFloor, setPreviewFloor] = useState(1)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [promptCollapsed, setPromptCollapsed] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!projectId || !versionStr) return
    const version = Number(versionStr)
    setLoading(true)
    Promise.all([
      api.getProject(projectId),
      api.getDesign(projectId, version),
      api.getSystemPrompt().catch(() => ({ prompt: '' })),
    ]).then(([proj, des, sp]) => {
      setProjectName(proj.name)
      setDesign(des)
      setSystemPrompt(sp.prompt)
      const formatted = JSON.stringify(des.json_definition, null, 2)
      setJsonText(formatted)
      const floors = [...new Set((des.json_definition.rooms ?? []).map((r) => r.floor))].sort((a, b) => a - b)
      setPreviewFloor(floors[0] ?? 1)
      setPreviewSvg(renderSvgPreview(des.json_definition, floors[0] ?? 1))
    }).catch((e) => {
      console.error('[DesignEditor] Load failed:', e)
      toast({ message: 'Failed to load design', type: 'error' })
    }).finally(() => setLoading(false))
  }, [projectId, versionStr, toast])

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        JSON.parse(jsonText)
        setParseError(null)
      } catch (e) {
        setParseError(String(e))
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [jsonText])

  const parseCurrent = useCallback((): DesignDefinition | null => {
    try {
      const parsed = JSON.parse(jsonText)
      setParseError(null)
      return parsed as DesignDefinition
    } catch (e) {
      setParseError(String(e))
      return null
    }
  }, [jsonText])

  const handleFormat = () => {
    const parsed = parseCurrent()
    if (parsed) {
      setJsonText(JSON.stringify(parsed, null, 2))
    }
  }

  const handleSave = async () => {
    const parsed = parseCurrent()
    if (!parsed) {
      toast({ message: 'Fix JSON errors before saving', type: 'error' })
      return
    }
    if (!design) return
    setSaving(true)
    try {
      const updated = await api.updateDesign(projectId, design.version, parsed)
      setDesign(updated)
      useProjectStore.getState().updateDesignDefinition(updated.id, updated.json_definition)
      setJsonText(JSON.stringify(updated.json_definition, null, 2))
      setPreviewSvg(renderSvgPreview(updated.json_definition, previewFloor))
      toast({ message: 'Design saved', type: 'success' })
    } catch (e) {
      console.error('[DesignEditor] Save failed:', e)
      toast({ message: 'Failed to save design', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleResolve = async () => {
    const parsed = parseCurrent()
    if (!parsed) {
      toast({ message: 'Fix JSON errors before resolving', type: 'error' })
      return
    }
    if (!design) return
    setResolving(true)
    try {
      const updated = await api.resolveDesign(projectId, design.version, parsed)
      setDesign(updated)
      setJsonText(JSON.stringify(updated.json_definition, null, 2))
      setPreviewSvg(renderSvgPreview(updated.json_definition, previewFloor))
      toast({ message: 'Layout re-solved', type: 'success' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to re-solve layout'
      console.error('[DesignEditor] Resolve failed:', msg)
      setParseError(msg)
      toast({ message: msg, type: 'error' })
    } finally {
      setResolving(false)
    }
  }

  const copyText = async (text: string | null, label: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast({ message: `Copied ${label}`, type: 'success' })
    } catch {
      toast({ message: 'Failed to copy to clipboard', type: 'error' })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleResolve()
    }
  }

  const lineCount = jsonText.split('\n').length
  const version = design?.version ?? Number(versionStr)

  const parsedDef = (() => {
    try { return JSON.parse(jsonText) as DesignDefinition } catch { return null }
  })()

  if (loading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>Loading...</h1>
          </div>
        </header>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/')}>
            &larr; Back
          </button>
          <h1 className={styles.title}>Design Editor</h1>
          {projectName && (
            <span className={styles.subtitle}>
              &middot; {projectName} &middot; v{version}
            </span>
          )}
        </div>
        <div className={styles.headerRight}>
          <button className={styles.formatBtn} onClick={handleFormat}>
            Format
          </button>
          <button
            className={styles.resolveBtn}
            onClick={handleResolve}
            disabled={resolving || parseError != null}
          >
            {resolving ? 'Resolving...' : 'Re-solve'}
          </button>
          <button
            className={styles.formatBtn}
            onClick={() => navigate(`/3d-viewer?project=${projectId}&version=${version}`)}
            disabled={!parsedDef}
          >
            3D
          </button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saving || parseError != null}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.editorPanel}>
          {systemPrompt && (
            <div className={styles.promptSection}>
              <div
                className={styles.promptHeader}
                onClick={() => setPromptCollapsed(!promptCollapsed)}
              >
                <span>System Prompt</span>
                <span className={styles.collapseArrow}>
                  {promptCollapsed ? '\u25B6' : '\u25BC'}
                </span>
              </div>
              {!promptCollapsed && (
                <textarea
                  className={styles.promptTextarea}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  spellCheck={false}
                />
              )}
            </div>
          )}

          <div className={styles.editorHeader}>
            <span className={styles.editorLabel}>DesignDefinition JSON</span>
            {parseError && (
              <span className={styles.errorBadge}>Invalid JSON</span>
            )}
          </div>
          <div className={styles.editorContainer}>
            <div className={styles.lineNumbers}>
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} className={styles.lineNumber}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className={`${styles.editor} ${parseError ? styles.editorError : ''}`}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              wrap="off"
            />
          </div>

          {parseError && (
            <div className={styles.errorSection}>
              <div className={styles.errorHeader}>JSON Error</div>
              <textarea
                className={styles.errorTextarea}
                value={parseError}
                onChange={() => {}}
                spellCheck={false}
              />
            </div>
          )}

          <div className={styles.toolbarSection}>
            <button
              className={styles.toolbarBtn}
              onClick={() => copyText(systemPrompt, 'System prompt')}
              disabled={!systemPrompt}
            >
              Copy Prompt
            </button>
            <button
              className={styles.toolbarBtn}
              onClick={() => copyText(parsedDef ? jsonToTypescript(parsedDef) : null, 'TypeScript type')}
              disabled={!parsedDef}
            >
              Copy Type
            </button>
            <button
              className={styles.toolbarBtn}
              onClick={() => copyText(jsonText, 'JSON')}
            >
              Copy JSON
            </button>
            <button
              className={styles.toolbarBtn}
              onClick={() => {
                try {
                  copyText(JSON.stringify(JSON.parse(jsonText)), 'Compact JSON')
                } catch {}
              }}
            >
              Copy Compact
            </button>
            <button
              className={styles.toolbarBtn}
              onClick={() => copyText(parseError, 'Error message')}
              disabled={!parseError}
            >
              Copy Error
            </button>
          </div>
        </div>

        <div className={styles.previewPanel}>
          <div className={styles.previewHeader}>
            <span className={styles.previewLabel}>Floor Plan Preview</span>
            {(() => {
              const parsed = parsedDef
              const floors = parsed ? [...new Set((parsed.rooms ?? []).map((r) => r.floor))].sort((a, b) => a - b) : []
              if (floors.length <= 1) return null
              return (
                <div className={styles.floorBar}>
                  {floors.map((f) => (
                    <button
                      key={f}
                      className={`${styles.floorBtn} ${f === previewFloor ? styles.floorActive : ''}`}
                      onClick={() => {
                        setPreviewFloor(f)
                        setPreviewSvg(renderSvgPreview(parsed!, f))
                      }}
                    >
                      {f === 0 ? 'Basement' : f === 1 ? 'Ground' : `Floor ${f}`}
                    </button>
                  ))}
                </div>
              )
            })()}
          </div>
          <div className={styles.previewContent}>
            <div
              className={styles.previewSvg}
              dangerouslySetInnerHTML={{ __html: previewSvg }}
            />
          </div>
          <div className={styles.previewFooter}>
            <span className={styles.previewInfo}>
              {(() => {
                const parsed = parsedDef
                if (!parsed) return '0 rooms'
                const floorRooms = parsed.rooms.filter((r) => r.floor === previewFloor)
                return `${floorRooms.length} rooms (F${previewFloor})`
              })()}
            </span>
            <span className={styles.previewInfo}>{design?.json_definition?.style}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
