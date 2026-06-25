import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ConnectionStatus } from './components/ConnectionStatus'
import { ComfyStatus } from './components/ComfyStatus'
import { ToastContainer } from './components/Toast'
import { ChatPanel } from './components/ChatPanel'
import { FloorPlanCanvas } from './components/FloorPlanCanvas'
import { ProjectSidebar } from './components/ProjectSidebar'
import { FurnitureGeneratorPage } from './components/FurnitureGeneratorPage'
import { ShortcutGuide } from './components/ShortcutGuide'
import { ProjectManagerPage } from './components/ProjectManagerPage'
import { DesignEditorPage } from './components/DesignEditorPage'
import { ImageImportPage } from './components/ImageImportPage'
import { ModelViewer3DPage } from './components/ModelViewer3DPage'

import { api } from './api'
import { useProjectStore } from './store/projectStore'
import { useChatStore } from './store/chatStore'
import styles from './App.module.css'

const SettingsPanel = lazy(() =>
  import('./components/SettingsPanel').then((m) => ({ default: m.SettingsPanel }))
)
const CatalogPanel = lazy(() =>
  import('./components/CatalogPanel').then((m) => ({ default: m.CatalogPanel }))
)
const IntelligencePage = lazy(() =>
  import('./components/IntelligencePage').then((m) => ({ default: m.IntelligencePage }))
)
const WalkthroughPage = lazy(() =>
  import('./pages/WalkthroughPage').then((m) => ({ default: m.WalkthroughPage }))
)
const WelcomePage = lazy(() =>
  import('./pages/WelcomePage').then((m) => ({ default: m.WelcomePage }))
)

function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId } = useParams<{ projectId: string }>()
  const [showSettings, setShowSettings] = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)
  const [connected, setConnected] = useState(false)
  const [checking, setChecking] = useState(true)
  const [mockMode, setMockMode] = useState(false)
  const [comfyConnected, setComfyConnected] = useState(false)
  const [comfyChecking, setComfyChecking] = useState(true)
  const { activeProjectId, setActiveProject, loadDesigns, designs } = useProjectStore()
  const { loadMessages, clearMessages } = useChatStore()

  useEffect(() => {
    if (projectId && projectId !== activeProjectId) {
      setActiveProject(projectId)
    }
  }, [projectId])

  const refreshConnection = () => {
    api.health()
      .then((h) => { setConnected(true); setMockMode(h.mock_ai); setComfyConnected(h.comfy_connected ?? false) })
      .catch(() => setConnected(false))
      .finally(() => { setChecking(false); setComfyChecking(false) })
  }

  useEffect(() => {
    let cancelled = false
    const check = () =>
      api.health()
        .then((h) => { if (!cancelled) { setConnected(true); setMockMode(h.mock_ai); setComfyConnected(h.comfy_connected ?? false) } })
        .catch(() => { if (!cancelled) setConnected(false) })
        .finally(() => { if (!cancelled) { setChecking(false); setComfyChecking(false) } })

    check()
    const interval = setInterval(check, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  useEffect(() => {
    if (activeProjectId) {
      loadDesigns(activeProjectId)
      loadMessages(activeProjectId)
    } else {
      clearMessages()
    }
  }, [activeProjectId, loadDesigns, location.pathname])

  if (checking) {
    return (
      <div className={styles.app}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.logo}>CAIW</h1>
            <span className={styles.tagline}>AI Design Studio</span>
          </div>
          <div className={styles.headerRight}>
            <ConnectionStatus connected={false} checking={true} mockMode={false} />
            <ComfyStatus connected={false} checking={true} />
          </div>
        </header>
        <div className={styles.bodySkeleton}>
          <div className={styles.skeletonPanel}>
            <div className={styles.skeletonShimmer} style={{ height: '60%' }} />
            <div className={styles.skeletonShimmer} style={{ height: '30%', marginTop: '8px' }} />
          </div>
          <div className={styles.skeletonMain}>
            <div className={styles.skeletonShimmer} style={{ height: '100%' }} />
          </div>
          <div className={styles.skeletonPanel}>
            <div className={styles.skeletonShimmer} style={{ height: '40%' }} />
            <div className={styles.skeletonShimmer} style={{ height: '20%', marginTop: '8px' }} />
            <div className={styles.skeletonShimmer} style={{ height: '20%', marginTop: '8px' }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerLeft} style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          <h1 className={styles.logo}>CAIW</h1>
          <span className={styles.tagline}>AI Design Studio</span>
        </div>
        <div className={styles.headerRight}>
          <ConnectionStatus connected={connected} checking={checking} mockMode={mockMode} />
          <ComfyStatus connected={comfyConnected} checking={comfyChecking} />
          <button className={styles.settingsBtn} onClick={() => navigate('/import')}>
            Import
          </button>
          <button className={styles.settingsBtn} onClick={() => navigate('/projects')}>
            Projects
          </button>
          {activeProjectId && designs.length > 0 && (
            <>
              <button
                className={styles.settingsBtn}
                onClick={() => {
                  const latest = designs.reduce((a, b) => a.version > b.version ? a : b)
                  navigate(`/design-editor?project=${activeProjectId}&version=${latest.version}`)
                }}
              >
                Edit JSON
              </button>
              <button
                className={styles.settingsBtn}
                onClick={() => {
                  const latest = designs.reduce((a, b) => a.version > b.version ? a : b)
                  navigate(`/3d-viewer?project=${activeProjectId}&version=${latest.version}`)
                }}
              >
                3D
              </button>
              <button
                className={styles.settingsBtn}
                onClick={() => {
                  const latest = designs.reduce((a, b) => a.version > b.version ? a : b)
                  navigate(`/walkthrough?project=${activeProjectId}&version=${latest.version}`)
                }}
              >
                VR
              </button>
              <button
                className={styles.settingsBtn}
                onClick={() => {
                  const latest = designs.reduce((a, b) => a.version > b.version ? a : b)
                  navigate(`/intelligence?project=${activeProjectId}&version=${latest.version}`)
                }}
              >
                Insights
              </button>
            </>
          )}
          <button className={styles.settingsBtn} onClick={() => navigate('/furniture')}>
            Furniture
          </button>
          <button className={styles.settingsBtn} onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </div>
      </header>
      <div className={styles.body}>
        <ErrorBoundary>
          <ChatPanel />
        </ErrorBoundary>
        <main className={styles.main}>
          <FloorPlanCanvas />
        </main>
        <ErrorBoundary>
          <ProjectSidebar />
        </ErrorBoundary>
      </div>
      {showCatalog && (
        <Suspense fallback={null}>
          <CatalogPanel onClose={() => setShowCatalog(false)} />
        </Suspense>
      )}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsPanel onClose={() => setShowSettings(false)} onSettingsChange={refreshConnection} />
        </Suspense>
      )}
      <ShortcutGuide />
      <ToastContainer />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ErrorBoundary><Suspense fallback={<div className={styles.bodySkeleton}><div className={styles.skeletonMain}><div className={styles.skeletonShimmer} style={{ height: '100%' }} /></div></div>}><WelcomePage /></Suspense></ErrorBoundary>} />
        <Route path="/project/new" element={<MainLayout />} />
        <Route path="/project/:projectId" element={<MainLayout />} />
        <Route path="/furniture" element={<ErrorBoundary><FurnitureGeneratorPage /></ErrorBoundary>} />
        <Route path="/projects" element={<ErrorBoundary><ProjectManagerPage /></ErrorBoundary>} />
        <Route path="/design-editor" element={<ErrorBoundary><DesignEditorPage /></ErrorBoundary>} />
        <Route path="/import" element={<ErrorBoundary><ImageImportPage /></ErrorBoundary>} />
        <Route path="/3d-viewer" element={<ErrorBoundary><ModelViewer3DPage /></ErrorBoundary>} />
        <Route path="/walkthrough" element={<ErrorBoundary><Suspense fallback={<div className={styles.bodySkeleton}><div className={styles.skeletonMain}><div className={styles.skeletonShimmer} style={{ height: '100%' }} /></div></div>}><WalkthroughPage /></Suspense></ErrorBoundary>} />
        <Route path="/intelligence" element={<ErrorBoundary><Suspense fallback={null}><IntelligencePage /></Suspense></ErrorBoundary>} />
      </Routes>
    </BrowserRouter>
  )
}
