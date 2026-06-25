import { useState, useEffect, useRef } from 'react'
import type { EvolutionEntry } from '../types'
import { api } from '../api'
import { renderSvgPreview } from '../utils/svgPreview'

interface Props {
  projectId: string
  currentVersion: number
}

export function EvolutionTimeline({ projectId, currentVersion }: Props) {
  const [entries, setEntries] = useState<EvolutionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<number>(currentVersion)
  const [compareMode, setCompareMode] = useState(false)
  const [compareVersion, setCompareVersion] = useState<number | null>(null)
  const [sliderPos, setSliderPos] = useState(50)
  const [svgCache, setSvgCache] = useState<Map<number, string>>(new Map())
  const sliderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.getEvolution(projectId)
      .then((data) => { if (!cancelled) setEntries(data) })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectId])

  useEffect(() => {
    if (!compareMode || !compareVersion) {
      setSliderPos(50)
      return
    }
    let cancelled = false
    Promise.all([
      api.getDesign(projectId, currentVersion),
      api.getDesign(projectId, compareVersion),
    ]).then(([d1, d2]) => {
      if (!cancelled) {
        setSvgCache((prev) => new Map(prev).set(currentVersion, renderSvgPreview(d1.json_definition)).set(compareVersion, renderSvgPreview(d2.json_definition)))
      }
    })
    return () => { cancelled = true }
  }, [compareMode, compareVersion, currentVersion, projectId])

  const handleSliderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startPos = sliderPos

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const container = sliderRef.current
      if (container) {
        const pct = startPos + (dx / container.offsetWidth) * 100
        setSliderPos(Math.max(0, Math.min(100, pct)))
      }
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#a0a0b0', fontSize: 13 }}>
        Loading evolution data...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#ef4444', fontSize: 13 }}>
        {error}
      </div>
    )
  }

  if (!entries.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#a0a0b0', fontSize: 13 }}>
        No evolution data available
      </div>
    )
  }

  const currentEntry = entries.find((e) => e.version === selectedVersion) ?? entries[entries.length - 1]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflow: 'hidden' }}>
          {entries.map((e, i) => (
            <div
              key={e.version}
              style={{
                display: 'flex',
                alignItems: 'center',
                flex: 1,
                position: 'relative',
              }}
            >
              <button
                onClick={() => setSelectedVersion(e.version)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: selectedVersion === e.version ? '2px solid #e94560' : '2px solid #2a2a4a',
                  background: selectedVersion === e.version ? '#e94560' : '#16213e',
                  color: '#eaeaea',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'Inter, sans-serif',
                  flexShrink: 0,
                  zIndex: 1,
                  transition: 'all 0.2s',
                }}
                title={`v${e.version}`}
              >
                {e.version}
              </button>
              {i < entries.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    background: selectedVersion >= e.version && selectedVersion <= entries[i + 1].version ? '#e94560' : '#2a2a4a',
                    margin: '0 -1px',
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#a0a0b0', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={compareMode}
            onChange={(e) => { setCompareMode(e.target.checked); setCompareVersion(e.target.checked ? entries[0]?.version ?? null : null) }}
            style={{ accentColor: '#e94560' }}
          />
          Compare
        </label>
      </div>

      {currentEntry && (
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#a0a0b0', flexWrap: 'wrap' }}>
          <span>v{currentEntry.version}</span>
          <span>&middot;</span>
          <span>{currentEntry.rooms_added.length > 0 ? `+${currentEntry.rooms_added.length} rooms` : 'No changes'}</span>
          {currentEntry.area_change !== 0 && (
            <>
              <span>&middot;</span>
              <span style={{ color: currentEntry.area_change > 0 ? '#22c55e' : '#ef4444' }}>
                {currentEntry.area_change > 0 ? '+' : ''}{currentEntry.area_change}m²
              </span>
            </>
          )}
        </div>
      )}

      {compareMode && compareVersion && (
        <div
          ref={sliderRef}
          style={{
            position: 'relative',
            width: '100%',
            height: 250,
            overflow: 'hidden',
            borderRadius: 6,
            background: '#0f3460',
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex' }}>
            <div
              style={{
                width: `${sliderPos}%`,
                height: '100%',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, zIndex: 2 }}>
                v{currentVersion}
              </div>
              <div style={{ width: '200%', height: '100%', transform: `translateX(0)` }}>
                <SvgPreviewInline definition={svgCache.get(currentVersion)} />
              </div>
            </div>
            <div
              style={{
                width: `${100 - sliderPos}%`,
                height: '100%',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, zIndex: 2 }}>
                v{compareVersion}
              </div>
              <div style={{ width: '200%', height: '100%', marginLeft: `-${100 - sliderPos}%` }}>
                <SvgPreviewInline definition={svgCache.get(compareVersion)} />
              </div>
            </div>
          </div>
          <div
            onMouseDown={handleSliderMouseDown}
            style={{
              position: 'absolute',
              top: 0,
              left: `${sliderPos}%`,
              width: 4,
              height: '100%',
              background: '#e94560',
              cursor: 'col-resize',
              zIndex: 3,
              transform: 'translateX(-2px)',
            }}
          />
        </div>
      )}
    </div>
  )
}

function SvgPreviewInline({ definition }: { definition: string | undefined }) {
  if (!definition) return null
  return (
    <div
      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      dangerouslySetInnerHTML={{ __html: definition }}
    />
  )
}
