import { useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSceneStore } from '../store/sceneStore'
import { SceneView } from './SceneView'
import { ToolPanel } from './ToolPanel'
import { PropertiesPanel } from './PropertiesPanel'
import styles from './ModelViewer3DPage.module.css'

export function ModelViewer3DPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const projectId = params.get('project')
  const versionStr = params.get('version')
  const version = versionStr ? Number(versionStr) : NaN

  const { loading, error, definition, loadDesign, designVersion } = useSceneStore()

  useEffect(() => {
    if (projectId && !isNaN(version)) {
      loadDesign(projectId, version)
    }
  }, [projectId, version, loadDesign])

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
          <h1 className={styles.title}>Loading 3D Model...</h1>
        </header>
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
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button className={styles.homeBtn} onClick={() => navigate('/')}>
              CAIW
            </button>
            <button className={styles.backBtn} onClick={handleBack}>
              &larr; Back
            </button>
            <h1 className={styles.title}>3D Model Viewer</h1>
          </div>
        </header>
        <div className={styles.errorBody}>
          <span className={styles.errorText}>Failed to load design: {error}</span>
          <button className={styles.retryBtn} onClick={() => projectId && !isNaN(version) && loadDesign(projectId, version)}>
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
            <h1 className={styles.title}>3D Model Viewer</h1>
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
          <h1 className={styles.title}>3D Model Viewer</h1>
          {definition && (
            <span className={styles.subtitle}>
              &middot; {definition.buildingType} &middot; {definition.style}
            </span>
          )}
        </div>
      </header>
      <div className={styles.body}>
        <ToolPanel />
        <SceneView />
        <PropertiesPanel />
      </div>
    </div>
  )
}
