import { useState, useEffect } from 'react'
import { api } from '../api'
import type { FurnitureCatalogItem } from '../types'
import styles from './CatalogPanel.module.css'

interface Props {
  onClose: () => void
}

export function CatalogPanel({ onClose }: Props) {
  const [items, setItems] = useState<FurnitureCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<FurnitureCatalogItem | null>(null)

  const load = async (q?: string) => {
    setLoading(true)
    try {
      const result = await api.listCatalog({ q, limit: 100 })
      setItems(result)
    } catch (e) {
      console.error('[Catalog] Failed to load:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSearch = () => {
    load(search || undefined)
  }

  const handleDelete = async (id: string) => {
    await api.deleteCatalogItem(id)
    setItems((s) => s.filter((i) => i.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Furniture Catalog</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            placeholder="Search furniture..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className={styles.searchBtn} onClick={handleSearch}>Search</button>
        </div>

        <div className={styles.body}>
          {loading && <div className={styles.empty}>Loading...</div>}
          {!loading && items.length === 0 && (
            <div className={styles.empty}>
              {search ? 'No matching furniture found.' : 'No furniture cataloged yet. Generate a design with a render to populate the catalog.'}
            </div>
          )}
          <div className={styles.grid}>
            {items.map((item) => (
              <div
                key={item.id}
                className={`${styles.card} ${selected?.id === item.id ? styles.cardSelected : ''}`}
                onClick={() => setSelected(item)}
              >
                <div className={styles.thumb}>
                  {item.image_path ? (
                    <img src={item.image_path} alt={item.name} className={styles.thumbImg} />
                  ) : (
                    <div className={styles.thumbPlaceholder}>{item.name[0]}</div>
                  )}
                </div>
                <div className={styles.cardInfo}>
                  <span className={styles.cardName}>{item.name}</span>
                  <span className={styles.cardDim}>{item.default_width}×{item.default_length}m</span>
                  <span className={styles.cardRoom}>{item.typical_room_type.replace('_', ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {selected && (
          <div className={styles.detail}>
            <div className={styles.detailHeader}>
              <span className={styles.detailTitle}>{selected.name}</span>
              <button className={styles.closeBtn} onClick={() => setSelected(null)}>×</button>
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
            <button className={styles.deleteBtn} onClick={() => handleDelete(selected.id)}>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
