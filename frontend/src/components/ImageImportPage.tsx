import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { DesignDefinition, ModelItem } from '../types'
import { useToastStore } from '../store/toastStore'
import { useProjectStore } from '../store/projectStore'
import { useChatStore } from '../store/chatStore'
import styles from './ImageImportPage.module.css'
import { renderSvgPreview } from '../utils/svgPreview'


export function ImageImportPage() {
  const navigate = useNavigate()
  const toast = useToastStore((s) => s.addToast)
  const { setActiveProject, loadDesigns } = useProjectStore()
  const chatStore = useChatStore()

  const [models, setModels] = useState<ModelItem[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DesignDefinition | null>(null)
  const [resultMessage, setResultMessage] = useState('')
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [previewFloor, setPreviewFloor] = useState(1)
  const [previewSvg, setPreviewSvg] = useState('')
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    api.listModels()
      .then((m) => {
        if (cancelled) return
        const visionModels = m.filter((mod) => mod.supports_vision)
        setModels(visionModels)
        if (visionModels.length > 0) {
          setSelectedModelId(visionModels[0].id)
        }
      })
      .catch(() => { if (!cancelled) toast({ message: 'Failed to load models', type: 'error' }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [toast])

  const handleFileDrop = useCallback((file: File) => {
    setError(null)
    setResult(null)
    setJsonText('')
    setPreviewSvg('')

    const allowed = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowed.includes(file.type)) {
      setError(`Unsupported file type: ${file.type}. Allowed: PNG, JPEG, WEBP`)
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: 10 MB`)
      return
    }

    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileDrop(file)
  }

  const handleBrowseClick = () => fileInputRef.current?.click()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileDrop(file)
  }

  const parseCurrent = useCallback((): DesignDefinition | null => {
    try {
      const parsed = JSON.parse(jsonText)
      setJsonError(null)
      return parsed as DesignDefinition
    } catch (e) {
      setJsonError(String(e))
      return null
    }
  }, [jsonText])

  const handleAnalyze = async () => {
    if (!imageFile || !selectedModelId) return
    setAnalyzing(true)
    setError(null)
    setResult(null)
    setJsonText('')
    setPreviewSvg('')

    try {
      const res = await api.importFromImage(imageFile, prompt, selectedModelId)
      setResult(res.json_definition)
      setResultMessage(res.message)
      const formatted = JSON.stringify(res.json_definition, null, 2)
      setJsonText(formatted)
      const floors = [...new Set((res.json_definition.rooms ?? []).map((r) => r.floor))].sort((a, b) => a - b)
      setPreviewFloor(floors[0] ?? 1)
      setPreviewSvg(renderSvgPreview(res.json_definition, floors[0] ?? 1))
      toast({ message: res.message, type: 'success' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Analysis failed'
      setError(msg)
      toast({ message: msg, type: 'error' })
    } finally {
      setAnalyzing(false)
    }
  }

  const handleResolve = async () => {
    const parsed = parseCurrent()
    if (!parsed) return
    setError(null)
    setResult(parsed)
    setPreviewSvg(renderSvgPreview(parsed, previewFloor))
    toast({ message: 'JSON updated. Use Load into Canvas to persist.', type: 'success' })
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText)
      toast({ message: 'Copied JSON to clipboard', type: 'success' })
    } catch {
      toast({ message: 'Failed to copy', type: 'error' })
    }
  }

  const handleLoadIntoCanvas = async () => {
    const parsed = parseCurrent()
    if (!parsed) {
      toast({ message: 'Fix JSON errors before loading', type: 'error' })
      return
    }

    try {
      const name = imageFile?.name?.replace(/\.[^/.]+$/, '') || 'Imported Design'
      const project = await api.createProject(name, prompt || 'Imported from image')
      const design = await api.updateDesign(project.id, 1, parsed)
      setActiveProject(project.id)
      await loadDesigns(project.id)
      await chatStore.loadMessages(project.id)
      toast({ message: 'Design loaded into canvas', type: 'success' })
      navigate(`/project/${project.id}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create project'
      toast({ message: msg, type: 'error' })
    }
  }

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

  const floors = result
    ? [...new Set(result.rooms.map((r) => r.floor))].sort((a, b) => a - b)
    : []

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.homeBtn} onClick={() => navigate('/')}>
            CAIW
          </button>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            &larr; Back
          </button>
          <h1 className={styles.title}>Import Floor Plan from Image</h1>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.leftPanel}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Upload Image</div>
            <div
              className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleBrowseClick}
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className={styles.previewImage} />
              ) : (
                <>
                  <div className={styles.dropZoneText}>
                    Drop a floor plan image here or click to browse
                  </div>
                  <div className={styles.dropZoneHint}>
                    PNG, JPEG, WEBP &middot; Max 10 MB
                  </div>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>AI Model</div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Vision-capable model</label>
              <select
                className={styles.select}
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
              >
                {models.length === 0 && (
                  <option value="">No vision-capable models configured</option>
                )}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.provider}/{m.model_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Extra Context (Optional)</div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Additional description to guide the AI
              </label>
              <textarea
                className={styles.textInput}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g. "Modern 3-bedroom house with open kitchen, 120m²"'
              />
            </div>
          </div>

          <button
            className={styles.analyzeBtn}
            onClick={handleAnalyze}
            disabled={!imageFile || !selectedModelId || analyzing}
          >
            {analyzing ? (
              <>
                <span className={styles.spinner} />
                Analyzing...
              </>
            ) : (
              'Analyze Image'
            )}
          </button>

          {error && <div className={styles.errorBox}>{error}</div>}
          {resultMessage && !error && (
            <div className={styles.successBox}>{resultMessage}</div>
          )}
        </div>

        <div className={styles.rightPanel}>
          {result && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Floor Plan Preview</div>
                {floors.length > 1 && (
                  <div className={styles.floorBar} style={{ marginBottom: 8 }}>
                    {floors.map((f) => (
                      <button
                        key={f}
                        className={`${styles.floorBtn} ${f === previewFloor ? styles.floorActive : ''}`}
                        onClick={() => {
                          setPreviewFloor(f)
                          setPreviewSvg(renderSvgPreview(result, f))
                        }}
                      >
                        {f === 0 ? 'Basement' : f === 1 ? 'Ground' : `Floor ${f}`}
                      </button>
                    ))}
                  </div>
                )}
                <div
                  className={styles.previewSvg}
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                />
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>DesignDefinition JSON</div>
                <div className={styles.resultsToolbar}>
                  <button className={styles.loadBtn} onClick={handleLoadIntoCanvas}>
                    Load into Canvas
                  </button>
                  <button
                    className={styles.resolveBtn}
                    onClick={handleResolve}
                    disabled={jsonError != null}
                  >
                    Apply Edits
                  </button>
                  <button className={styles.copyBtn} onClick={handleCopy}>
                    Copy JSON
                  </button>
                </div>
                <textarea
                  className={`${styles.jsonEditor} ${jsonError ? styles.jsonError : ''}`}
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  spellCheck={false}
                  wrap="off"
                  style={{ marginTop: 8 }}
                />
                {jsonError && (
                  <div className={styles.errorBox} style={{ marginTop: 8 }}>
                    {jsonError}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
