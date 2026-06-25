import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Project } from '../types'
import { useToastStore } from '../store/toastStore'
import styles from './ProjectManagerPage.module.css'

export function ProjectManagerPage() {
  const navigate = useNavigate()
  const toast = useToastStore((s) => s.addToast)

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.listProjects()
      setProjects(result)
    } catch (e) {
      console.error('[ProjectManager] Failed to load:', e)
      toast({ message: 'Failed to load projects', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === projects.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(projects.map((p) => p.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    setDeleting(true)
    try {
      const result = await api.bulkDeleteProjects(Array.from(selected))
      toast({ message: `Deleted ${result.deleted_count} project(s)`, type: 'success' })
      setSelected(new Set())
      setConfirmDelete(false)
      await load()
    } catch (e) {
      console.error('[ProjectManager] Bulk delete failed:', e)
      toast({ message: 'Failed to delete projects', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const handleSingleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete this project? This cannot be undone.`)) return
    try {
      await api.deleteProject(id)
      toast({ message: 'Project deleted', type: 'success' })
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next })
      await load()
    } catch (err) {
      console.error('[ProjectManager] Delete failed:', err)
      toast({ message: 'Failed to delete project', type: 'error' })
    }
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + '...' : text

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
          <h1 className={styles.title}>Project Manager</h1>
        </div>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.selectAll}>
          <input
            type="checkbox"
            checked={projects.length > 0 && selected.size === projects.length}
            onChange={toggleSelectAll}
          />
          <span>Select All</span>
        </label>

        {selected.size > 0 && (
          <span className={styles.selectedCount}>
            {selected.size} of {projects.length} selected
          </span>
        )}

        <div className={styles.toolbarActions}>
          <button
            className={styles.deleteBtn}
            disabled={selected.size === 0 || deleting}
            onClick={() => setConfirmDelete(true)}
          >
            {deleting ? 'Deleting...' : `Delete Selected${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </button>
          <button className={styles.exportBtn} disabled={selected.size === 0}>
            Export Selected
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div className={styles.overlay} onClick={() => !deleting && setConfirmDelete(false)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <h3>Delete {selected.size} project(s)?</h3>
            <p>This will permanently delete the selected projects and all their designs. This cannot be undone.</p>
            <div className={styles.confirmActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancel
              </button>
              <button className={styles.confirmDeleteBtn} onClick={handleBulkDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.body}>
        {loading ? (
          <div className={styles.emptyState}>Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No projects yet.</p>
            <p className={styles.emptyHint}>Create a project from the studio to get started.</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colCheck}></th>
                <th className={styles.colName}>Name</th>
                <th className={styles.colPrompt}>Prompt</th>
                <th className={styles.colDate}>Created</th>
                <th className={styles.colDate}>Updated</th>
                <th className={styles.colActions}></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p.id}
                  className={`${styles.row} ${selected.has(p.id) ? styles.rowSelected : ''}`}
                  onClick={() => navigate(`/project/${p.id}`)}
                >
                  <td className={styles.colCheck} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                    />
                  </td>
                  <td className={styles.colName}>{p.name}</td>
                  <td className={styles.colPrompt}>{truncate(p.original_prompt, 80)}</td>
                  <td className={styles.colDate}>{formatDate(p.created_at)}</td>
                  <td className={styles.colDate}>{formatDate(p.updated_at)}</td>
                  <td className={styles.colActions}>
                    <button
                      className={styles.rowDeleteBtn}
                      onClick={(e) => handleSingleDelete(p.id, e)}
                      title="Delete project"
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
