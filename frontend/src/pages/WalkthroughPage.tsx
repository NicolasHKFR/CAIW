import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { DesignDefinition } from '../types'
import { VRScene } from '../components/VRScene'
import styles from '../styles/WalkthroughPage.module.css'

export function WalkthroughPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const projectId = params.get('project')
  const versionStr = params.get('version')
  const version = versionStr ? Number(versionStr) : NaN

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [definition, setDefinition] = useState<DesignDefinition | null>(null)
  const [mode, setMode] = useState<'vr' | 'desktop'>('desktop')

  const loadDesign = useCallback(() => {
    if (!projectId || isNaN(version)) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    api
      .getDesign(projectId, version)
      .then((design) => {
        setDefinition(design.json_definition)
        setLoading(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load design')
        setLoading(false)
      })
  }, [projectId, version])

  useEffect(() => {
    loadDesign()
  }, [loadDesign])

  const handleBack = useCallback(() => {
    if (projectId) {
      navigate(`/project/${projectId}`)
    } else {
      navigate(-1)
    }
  }, [navigate, projectId])

  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'vr' ? 'desktop' : 'vr'))
  }, [])

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingBody}>
          <div className={styles.spinner} />
          <span className={styles.loadingText}>Loading design data...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBody}>
          <span className={styles.errorText}>
            Failed to load design: {error}
          </span>
          <button className={styles.retryBtn} onClick={loadDesign}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!definition) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyBody}>
          <span className={styles.emptyText}>
            {!projectId
              ? 'No project ID specified. Use ?project=X&version=Y in the URL.'
              : 'Version parameter missing.'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.canvas}>
        <VRScene
          definition={definition}
          mode={mode}
          showLabels={true}
        />
      </div>
      <div className={styles.hud}>
        <span className={styles.hudMode}>
          {mode === 'vr' ? 'VR Mode' : 'Desktop Walkthrough'}
        </span>
        {mode === 'vr' ? (
          <span className={styles.hudHint}>
            Right trigger to teleport &middot; Left trigger to measure
          </span>
        ) : (
          <span className={styles.hudHint}>
            Click canvas to lock pointer &middot; WASD to move
          </span>
        )}
        <button className={styles.hudButton} onClick={toggleMode}>
          Switch to {mode === 'vr' ? 'Desktop' : 'VR'}
        </button>
        <button className={styles.hudButton} onClick={handleBack}>
          Exit
        </button>
      </div>
    </div>
  )
}
