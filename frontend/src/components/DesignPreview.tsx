import { useProjectStore } from '../store/projectStore'
import { API_BASE } from '../api'
import styles from './DesignPreview.module.css'

export function DesignPreview() {
  const { designs, activeProjectId } = useProjectStore()
  const activeDesign = designs.find((d) => d.project_id === activeProjectId)

  if (!activeDesign) return null

  const hasPlan = activeDesign.floor_plan_image_path
  const hasRender = activeDesign.rendering_image_path

  if (!hasPlan && !hasRender) return null

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>
        Design Assets
        <span className={styles.version}>v{activeDesign.version}</span>
      </h3>
      <div className={styles.grid}>
        {hasRender && (
          <div className={styles.card}>
            <span className={styles.cardLabel}>Concept Render</span>
            <div className={styles.imageWrapper}>
              <img
                src={`${API_BASE}${activeDesign.rendering_image_path}`}
                alt="Concept rendering"
                className={styles.image}
              />
            </div>
          </div>
        )}
        {hasPlan && (
          <div className={styles.card}>
            <span className={styles.cardLabel}>Floor Plan</span>
            <div className={styles.imageWrapper}>
              <img
                src={`${API_BASE}${activeDesign.floor_plan_image_path}`}
                alt="Floor plan"
                className={styles.image}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
