import { useEffect, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useChatStore } from '../store/chatStore'
import styles from './ProjectSidebar.module.css'

export function ProjectSidebar() {
  const { projects, activeProjectId, loading, loadProjects, deleteProject, setActiveProject, loadDesigns } = useProjectStore()
  const { clearMessages } = useChatStore()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleSelect = (id: string) => {
    setActiveProject(id)
    loadDesigns(id)
    clearMessages()
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await deleteProject(id)
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    const { createProject } = useProjectStore.getState()
    const project = await createProject(newName.trim(), newPrompt.trim())
    setNewName('')
    setNewPrompt('')
    setShowNew(false)
    setActiveProject(project.id)
    loadDesigns(project.id)
    clearMessages()
    loadProjects()
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h2 className={styles.title}>Projects</h2>
        <button className={styles.newBtn} onClick={() => setShowNew(!showNew)}>
          +
        </button>
      </div>

      {showNew && (
        <div className={styles.newForm}>
          <input
            className={styles.input}
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <input
            className={styles.input}
            placeholder="Optional description"
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button className={styles.createBtn} onClick={handleCreate}>
            Create
          </button>
        </div>
      )}

      <div className={styles.list}>
        {loading && <p className={styles.loading}>Loading...</p>}
        {!loading && projects.length === 0 && (
          <p className={styles.empty}>No projects yet. Start a chat!</p>
        )}
        {projects.map((p) => (
          <div
            key={p.id}
            className={`${styles.item} ${p.id === activeProjectId ? styles.active : ''}`}
            onClick={() => handleSelect(p.id)}
          >
            <div className={styles.itemInfo}>
              <span className={styles.itemName}>{p.name}</span>
              <span className={styles.itemDate}>
                {new Date(p.updated_at).toLocaleDateString()}
              </span>
            </div>
            <button
              className={styles.deleteBtn}
              onClick={(e) => handleDelete(e, p.id)}
              title="Delete"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
