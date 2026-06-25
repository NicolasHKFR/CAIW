import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { FurnitureCatalogItem } from '../types'
import { useToastStore } from '../store/toastStore'
import styles from './FurnitureGeneratorPage.module.css'

const ROOM_TYPES = [
  'living_room', 'bedroom', 'kitchen', 'dining_room', 'bathroom',
  'hallway', 'study', 'laundry', 'storage', 'garage',
]

const STYLES = [
  'modern', 'contemporary', 'traditional', 'minimalist',
  'industrial', 'rustic', 'scandinavian', 'mid-century',
  'bohemian', 'japandi',
]

export function FurnitureGeneratorPage() {
  const navigate = useNavigate()
  const toast = useToastStore((s) => s.addToast)

  const [items, setItems] = useState<FurnitureCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<FurnitureCatalogItem | null>(null)
  const [generating, setGenerating] = useState(false)
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const [name, setName] = useState('')
  const [roomType, setRoomType] = useState('living_room')
  const [style, setStyle] = useState('modern')
  const [width, setWidth] = useState('1.0')
  const [length, setLength] = useState('1.0')
  const [preview, setPreview] = useState<FurnitureCatalogItem | null>(null)

  const [sdModels, setSdModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('')

  const load = useCallback(async (q?: string) => {
    setLoading(true)
    try {
      const result = await api.listCatalog({ q, limit: 100 })
      setItems(result)
    } catch (e) {
      console.error('[Furniture] Failed to load:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.listSdModels().then((models) => {
      setSdModels(models)
      if (models.length > 0) {
        const preferred = models.find((m) => !m.toLowerCase().includes('xl') && !m.toLowerCase().includes('turbo'))
        setSelectedModel(preferred || models[0])
      }
    }).catch(() => {
      console.warn('[Furniture] Failed to fetch SD models')
    })
  }, [])

  const handleSearch = () => {
    load(search || undefined)
  }

  const handleGenerate = async () => {
    if (!name.trim()) {
      toast({ message: 'Enter a furniture name', type: 'error' })
      return
    }
    setGenerating(true)
    setPreview(null)
    try {
      const item = await api.generateFurniture({
        name: name.trim(),
        typical_room_type: roomType,
        default_width: parseFloat(width) || 1.0,
        default_length: parseFloat(length) || 1.0,
        style,
        sd_model: selectedModel,
      })
      setPreview(item)
      setItems((s) => [item, ...s])
      toast({ message: `Generated "${name}"`, type: 'success' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Generation failed'
      toast({ message: msg, type: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteCatalogItem(id)
      setItems((s) => s.filter((i) => i.id !== id))
      if (selected?.id === id) setSelected(null)
      if (preview?.id === id) setPreview(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Delete failed'
      toast({ message: msg, type: 'error' })
    }
  }

  const toggleMultiSelect = (id: string) => {
    setMultiSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (multiSelected.size === items.length) {
      setMultiSelected(new Set())
    } else {
      setMultiSelected(new Set(items.map((i) => i.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (multiSelected.size === 0) return
    if (!confirm(`Delete ${multiSelected.size} furniture item(s)?`)) return
    setDeleting(true)
    try {
      const result = await api.bulkDeleteCatalogItems(Array.from(multiSelected))
      setItems((s) => s.filter((i) => !multiSelected.has(i.id)))
      if (selected && multiSelected.has(selected.id)) setSelected(null)
      if (preview && multiSelected.has(preview.id)) setPreview(null)
      setMultiSelected(new Set())
      toast({ message: `Deleted ${result.deleted_count} item(s)`, type: 'success' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bulk delete failed'
      toast({ message: msg, type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

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
          <h1 className={styles.title}>Furniture Generator</h1>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Generate Furniture</h3>

            <label className={styles.label}>
              Name
              <input
                className={styles.input}
                placeholder="e.g. Corner Sofa"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label className={styles.label}>
              Room Type
              <select className={styles.select} value={roomType} onChange={(e) => setRoomType(e.target.value)}>
                {ROOM_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
            </label>

            <label className={styles.label}>
              Style
              <select className={styles.select} value={style} onChange={(e) => setStyle(e.target.value)}>
                {STYLES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>

            <label className={styles.label}>
              Model
              <select className={styles.select} value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                {sdModels.length === 0 && <option value="">Loading...</option>}
                {sdModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>

            <div className={styles.row}>
              <label className={styles.label}>
                Width (m)
                <input
                  className={styles.input}
                  type="number"
                  step="0.1"
                  min="0.3"
                  max="5"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                Length (m)
                <input
                  className={styles.input}
                  type="number"
                  step="0.1"
                  min="0.3"
                  max="5"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                />
              </label>
            </div>

            <button
              className={styles.generateBtn}
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? 'Generating...' : 'Generate Image'}
            </button>
          </div>

          {preview && (
            <div className={styles.previewSection}>
              <h3 className={styles.sectionTitle}>Latest Result</h3>
              <div className={styles.previewCard}>
                {preview.image_path && (
                  <img src={preview.image_path} alt={preview.name} className={styles.previewImg} />
                )}
                <div className={styles.previewInfo}>
                  <strong>{preview.name}</strong>
                  <span>{preview.default_width} x {preview.default_length}m</span>
                  <span>{preview.typical_room_type.replace('_', ' ')}</span>
                </div>
              </div>
            </div>
          )}
        </aside>

        <main className={styles.catalog}>
          <div className={styles.catalogToolbar}>
            <label className={styles.selectAll}>
              <input
                type="checkbox"
                checked={items.length > 0 && multiSelected.size === items.length}
                onChange={toggleSelectAll}
              />
              <span>Select All</span>
            </label>
            <input
              className={styles.searchInput}
              placeholder="Search catalog..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button className={styles.searchBtn} onClick={handleSearch}>Search</button>
            {multiSelected.size > 0 && (
              <button
                className={styles.bulkDeleteBtn}
                onClick={handleBulkDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : `Delete (${multiSelected.size})`}
              </button>
            )}
          </div>

          <div className={styles.grid}>
            {loading && <div className={styles.empty}>Loading...</div>}
            {!loading && items.length === 0 && (
              <div className={styles.empty}>
                {search ? 'No matching furniture found.' : 'Generate your first piece of furniture!'}
              </div>
            )}
            {items.map((item) => (
              <div
                key={item.id}
                className={`${styles.card} ${selected?.id === item.id ? styles.cardSelected : ''} ${multiSelected.has(item.id) ? styles.cardMultiSelected : ''}`}
              >
                <div className={styles.checkOverlay}>
                  <input
                    type="checkbox"
                    className={styles.cardCheck}
                    checked={multiSelected.has(item.id)}
                    onChange={() => toggleMultiSelect(item.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className={styles.cardBody} onClick={() => setSelected(item)}>
                  <div className={styles.thumb}>
                    {item.image_path ? (
                      <img src={item.image_path} alt={item.name} className={styles.thumbImg} />
                    ) : (
                      <div className={styles.thumbPlaceholder}>{item.name[0]}</div>
                    )}
                  </div>
                  <div className={styles.cardInfo}>
                    <span className={styles.cardName}>{item.name}</span>
                    <span className={styles.cardDim}>{item.default_width} x {item.default_length}m</span>
                    <span className={styles.cardRoom}>{item.typical_room_type.replace('_', ' ')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selected && (
            <div className={styles.detail}>
              <div className={styles.detailHeader}>
                <span className={styles.detailTitle}>{selected.name}</span>
                <div className={styles.detailActions}>
                  <button className={styles.deleteBtn} onClick={() => handleDelete(selected.id)}>
                    Delete
                  </button>
                  <button className={styles.closeBtn} onClick={() => setSelected(null)}>&times;</button>
                </div>
              </div>
              {selected.image_path && (
                <img src={selected.image_path} alt={selected.name} className={styles.detailImg} />
              )}
              <div className={styles.detailInfo}>
                <div className={styles.detailRow}><span>Width</span><span>{selected.default_width}m</span></div>
                <div className={styles.detailRow}><span>Length</span><span>{selected.default_length}m</span></div>
                <div className={styles.detailRow}><span>Room</span><span>{selected.typical_room_type.replace('_', ' ')}</span></div>
                <div className={styles.detailRow}><span>Prompt</span><span className={styles.detailPrompt}>{selected.source_prompt}</span></div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
