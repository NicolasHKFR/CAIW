import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { Design, DesignDefinition, RoomSpec } from '../types'
import { useToastStore } from '../store/toastStore'
import { useProjectStore } from '../store/projectStore'
import styles from './DesignEditorPage.module.css'
import { renderSvgPreview } from '../utils/svgPreview'

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
      useProjectStore.getState().updateDesignDefinition(updated.id, updated.json_definition)
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
          <button className={styles.homeBtn} onClick={() => navigate('/')}>
            CAIW
          </button>
          <button className={styles.backBtn} onClick={() => projectId ? navigate(`/project/${projectId}`) : navigate(-1)}>
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
