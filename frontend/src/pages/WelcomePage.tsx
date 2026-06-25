import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConnectionStatus } from '../components/ConnectionStatus'
import { ComfyStatus } from '../components/ComfyStatus'
import { useProjectStore } from '../store/projectStore'
import { useChatStore } from '../store/chatStore'
import styles from './WelcomePage.module.css'

const features = [
  { icon: '🧠', title: 'AI Generation', desc: 'Describe any space in natural language — AI generates a complete architectural floor plan.' },
  { icon: '🎨', title: '2D Floor Plan', desc: 'Interactive canvas to view, select, and modify room layouts with zoom and pan.' },
  { icon: '🏗️', title: '3D Viewer', desc: 'Navigate your design in full 3D with orbit controls and realistic materials.' },
  { icon: '🥽', title: 'VR Walkthrough', desc: 'Immerse yourself in the space with VR teleport controls and measurement tools.' },
  { icon: '🪑', title: 'Furniture Gen', desc: 'AI-powered furniture placement — automatically furnish rooms based on their purpose.' },
  { icon: '📊', title: 'Design Insights', desc: 'AI-driven analysis of spatial quality, proportions, and design patterns.' },
]

export function WelcomePage() {
  const navigate = useNavigate()
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const [checking] = useState(true)
  const [connected] = useState(false)
  const [mockMode] = useState(false)
  const [comfyConnected] = useState(false)
  const [comfyChecking] = useState(true)

  const handleStartNew = () => {
    setActiveProject(null)
    clearMessages()
    navigate('/project/new')
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.logo}>CAIW</h1>
        </div>
        <div className={styles.headerRight}>
          <ConnectionStatus connected={connected} checking={checking} mockMode={mockMode} />
          <ComfyStatus connected={comfyConnected} checking={comfyChecking} />
          <button className={styles.headerBtn} onClick={() => navigate('/import')}>
            Import
          </button>
          <button className={styles.headerBtn} onClick={() => navigate('/projects')}>
            Projects
          </button>
          <button className={styles.headerBtn} onClick={() => navigate('/furniture')}>
            Furniture
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>CAIW</h1>
          <p className={styles.heroTagline}>AI Design Studio</p>
          <p className={styles.heroDescription}>
            Turn natural language descriptions into detailed architectural floor plans.
            Generate, visualize, and explore your dream spaces in 2D, 3D, and VR.
          </p>
        </div>

        <div className={styles.ctaRow}>
          <button className={styles.ctaPrimary} onClick={handleStartNew}>
            ✨ Start New Design
          </button>
          <button className={styles.ctaSecondary} onClick={() => navigate('/projects')}>
            📂 Browse Projects
          </button>
        </div>

        <div className={styles.features}>
          <h2 className={styles.featuresTitle}>Features</h2>
          <div className={styles.featureGrid}>
            {features.map((f) => (
              <div key={f.title} className={styles.featureCard}>
                <span className={styles.featureIcon}>{f.icon}</span>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureDesc}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <span className={styles.footerText}>CAIW — AI Design Studio</span>
      </div>
    </div>
  )
}
