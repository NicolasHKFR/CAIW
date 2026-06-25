import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { DesignDefinition, IntelligenceResponse } from '../types'
import { ScoreCard } from './ScoreCard'
import { SunlightMap } from './SunlightMap'
import { SunArc3D } from './SunArc3D'
import { SpaceHeatmap } from './SpaceHeatmap'
import { EvolutionTimeline } from './EvolutionTimeline'
import styles from '../styles/IntelligencePage.module.css'

export function IntelligencePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const projectId = params.get('project')
  const versionStr = params.get('version')
  const version = versionStr ? Number(versionStr) : NaN

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [definition, setDefinition] = useState<DesignDefinition | null>(null)
  const [intelligence, setIntelligence] = useState<IntelligenceResponse | null>(null)

  const loadData = useCallback(async () => {
    if (!projectId || isNaN(version)) return
    setLoading(true)
    setError(null)
    try {
      const [design, intel] = await Promise.all([
        api.getDesign(projectId, version),
        api.getIntelligence(projectId, version),
      ])
      setDefinition(design.json_definition)
      setIntelligence(intel)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load intelligence data')
    } finally {
      setLoading(false)
    }
  }, [projectId, version])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleBack = useCallback(() => {
    if (projectId) {
      navigate(`/project/${projectId}`)
    } else {
      navigate(-1)
    }
  }, [navigate, projectId])

  if (loading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Design Intelligence</h1>
        </header>
        <div className={styles.loadingBody}>
          <div className={styles.spinner} />
          <span className={styles.loadingText}>Analyzing design...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button className={styles.homeBtn} onClick={() => navigate('/')}>
              CAIW
            </button>
            <button className={styles.backBtn} onClick={handleBack}>
              &larr; Back
            </button>
            <h1 className={styles.title}>Design Intelligence</h1>
          </div>
        </header>
        <div className={styles.errorBody}>
          <span className={styles.errorText}>Failed to load: {error}</span>
          <button className={styles.retryBtn} onClick={loadData}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!definition) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button className={styles.homeBtn} onClick={() => navigate('/')}>
              CAIW
            </button>
            <button className={styles.backBtn} onClick={handleBack}>
              &larr; Back
            </button>
            <h1 className={styles.title}>Design Intelligence</h1>
          </div>
        </header>
        <div className={styles.emptyBody}>
          <span className={styles.emptyText}>
            {!projectId ? 'No project ID specified. Use ?project=X&version=Y in the URL.' : 'Version parameter missing.'}
          </span>
        </div>
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
          <button className={styles.backBtn} onClick={handleBack}>
            &larr; Back
          </button>
          <h1 className={styles.title}>Design Intelligence</h1>
          {definition && (
            <span className={styles.subtitle}>
              &middot; {definition.buildingType} &middot; {definition.style} &middot; v{version}
            </span>
          )}
        </div>
      </header>
      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Quality Score</div>
          {intelligence && <ScoreCard score={intelligence.score} />}
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Sunlight Analysis</div>
          {intelligence && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SunlightMap definition={definition} sunlight={intelligence.sunlight} />
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#a0a0b0' }}>
                <span>Heating: <strong style={{ color: '#ef4444' }}>{intelligence.sunlight.energy_estimate.heating_kwh.toFixed(0)} kWh/yr</strong></span>
                <span>Cooling: <strong style={{ color: '#2563eb' }}>{intelligence.sunlight.energy_estimate.cooling_kwh.toFixed(0)} kWh/yr</strong></span>
              </div>
            </div>
          )}
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Solar Arc</div>
          <SunArc3D definition={definition} />
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Space Efficiency</div>
          <SpaceHeatmap definition={definition} />
        </div>
        <div className={`${styles.card} ${styles.fullWidth}`}>
          <div className={styles.cardTitle}>Design Evolution</div>
          {projectId && !isNaN(version) && (
            <EvolutionTimeline projectId={projectId} currentVersion={version} />
          )}
        </div>
      </div>
    </div>
  )
}
