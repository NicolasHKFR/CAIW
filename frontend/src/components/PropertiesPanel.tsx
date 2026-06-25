import { useState, useCallback, useEffect } from 'react'
import { useSceneStore } from '../store/sceneStore'
import { useProjectStore } from '../store/projectStore'
import { useToastStore } from '../store/toastStore'
import { api } from '../api'
import { hashColor } from '../constants'
import type { RoomSpec, DesignDefinition } from '../types'
import styles from './PropertiesPanel.module.css'

export function PropertiesPanel() {
  const { definition, selection } = useSceneStore()
  const { activeProjectId, updateDesignDefinition } = useProjectStore()
  const { addToast } = useToastStore()

  const rooms = definition?.rooms ?? []
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEdits({})
  }, [selection.objectId, definition])

  const setEdit = useCallback((key: string, field: string, val: string) => {
    setEdits((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [field]: val },
    }))
  }, [])

  const editVal = useCallback((key: string, field: string, fallback: string) => {
    return edits[key]?.[field] ?? fallback
  }, [edits])

  const getActiveDesign = useCallback(() => {
    const { designs } = useProjectStore.getState()
    return designs.find((d) => d.project_id === activeProjectId)
  }, [activeProjectId])

  const saveRoom = useCallback(async (room: RoomSpec) => {
    if (!definition || !activeProjectId) return
    setSaving(true)
    const key = room.id
    const patch: Partial<RoomSpec> = {}
    const e = edits[key]
    if (e?.x !== undefined) patch.x = parseFloat(e.x)
    if (e?.y !== undefined) patch.y = parseFloat(e.y)
    if (e?.w !== undefined) patch.w = parseFloat(e.w)
    if (e?.h !== undefined) patch.h = parseFloat(e.h)
    if (e?.type !== undefined) patch.type = e.type

    const updatedRooms = rooms.map((r) =>
      r.id === room.id ? { ...r, ...patch } : r
    )
    const updatedDef: DesignDefinition = { ...definition, rooms: updatedRooms }
    const activeDesign = getActiveDesign()
    if (!activeDesign) { setSaving(false); return }
    updateDesignDefinition(activeDesign.id, updatedDef)
    try {
      await api.updateDesign(activeProjectId, activeDesign.version, updatedDef)
      addToast({ message: `${room.type} properties saved`, type: 'success' })
      setEdits((prev) => ({ ...prev, [key]: {} }))
    } catch {
      addToast({ message: 'Failed to save properties', type: 'error' })
    }
    setSaving(false)
  }, [definition, activeProjectId, rooms, edits, updateDesignDefinition, getActiveDesign, addToast])

  const saveFurniture = useCallback(async (roomId: string, furnitureId: string) => {
    if (!definition || !activeProjectId) return
    setSaving(true)
    const key = `f_${furnitureId}`
    const e = edits[key]
    const updatedRooms = rooms.map((r) => {
      if (r.id !== roomId) return r
      return {
        ...r,
        furniture: r.furniture.map((f) => {
          if (f.id !== furnitureId) return f
          const patch: Record<string, number> = {}
          if (e?.x !== undefined) patch.x = parseFloat(e.x)
          if (e?.y !== undefined) patch.y = parseFloat(e.y)
          if (e?.width !== undefined) patch.width = parseFloat(e.width)
          if (e?.length !== undefined) patch.length = parseFloat(e.length)
          return { ...f, ...patch }
        }),
      }
    })
    const updatedDef: DesignDefinition = { ...definition, rooms: updatedRooms }
    const activeDesign = getActiveDesign()
    if (!activeDesign) { setSaving(false); return }
    updateDesignDefinition(activeDesign.id, updatedDef)
    try {
      await api.updateDesign(activeProjectId, activeDesign.version, updatedDef)
      addToast({ message: 'Furniture properties saved', type: 'success' })
      setEdits((prev) => ({ ...prev, [key]: {} }))
    } catch {
      addToast({ message: 'Failed to save furniture properties', type: 'error' })
    }
    setSaving(false)
  }, [definition, activeProjectId, rooms, edits, updateDesignDefinition, getActiveDesign, addToast])

  const cancelEdit = useCallback((key: string) => {
    setEdits((prev) => ({ ...prev, [key]: {} }))
  }, [])

  if (!selection.objectId) {
    return (
      <div className={styles.panel}>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>&#x1F4CD;</span>
          <span className={styles.emptyText}>Select a room or furniture item</span>
        </div>
      </div>
    )
  }

  if (selection.objectType === 'room') {
    const room = rooms.find(r => r.id === selection.objectId)
    if (!room) return <div className={styles.panel}><span className={styles.emptyText}>Room not found</span></div>
    const key = room.id
    const hasEdits = Object.keys(edits[key] || {}).length > 0

    const numField = (label: string, field: string, val: number | null | undefined) => (
      <div className={styles.field}>
        <label className={styles.fieldLabel}>{label}</label>
        <input
          className={styles.fieldInput}
          type="number"
          step="0.1"
          value={editVal(key, field, val != null ? val.toFixed(2) : '')}
          onChange={(e) => setEdit(key, field, e.target.value)}
        />
      </div>
    )

    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.colorDot} style={{ background: hashColor(room.id) }} />
          <input
            className={styles.title}
            style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, color: 'var(--color-text)', width: '100%' }}
            value={editVal(key, 'type', room.type)}
            onChange={(e) => setEdit(key, 'type', e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>ID</label>
          <span className={styles.fieldValue}>{room.id}</span>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Floor</label>
          <span className={styles.fieldValue}>{room.floor ?? '-'}</span>
        </div>
        <div className={styles.divider} />
        {numField('X', 'x', room.x)}
        {numField('Y', 'y', room.y)}
        {numField('Width', 'w', room.w)}
        {numField('Length', 'h', room.h)}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Target Area</label>
          <span className={styles.fieldValue}>{room.targetArea.toFixed(1)} m²</span>
        </div>
        {room.w != null && room.h != null && (
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Actual Area</label>
            <span className={styles.fieldValue}>{(room.w * room.h).toFixed(1)} m²</span>
          </div>
        )}
        {hasEdits && (
          <div className={styles.actions}>
            <button className={styles.saveBtn} onClick={() => saveRoom(room)} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className={styles.cancelBtn} onClick={() => cancelEdit(key)}>Cancel</button>
          </div>
        )}
      </div>
    )
  }

  if (selection.objectType === 'furniture') {
    const parentRoom = rooms.find(r => r.id === selection.roomParentId)
    const furniture = parentRoom?.furniture?.find(f => f.id === selection.objectId)
    if (!furniture) return <div className={styles.panel}><span className={styles.emptyText}>Furniture not found</span></div>
    const key = `f_${furniture.id}`
    const hasEdits = Object.keys(edits[key] || {}).length > 0

    const numField = (label: string, field: string, val: number) => (
      <div className={styles.field}>
        <label className={styles.fieldLabel}>{label}</label>
        <input
          className={styles.fieldInput}
          type="number"
          step="0.1"
          value={editVal(key, field, val.toFixed(2))}
          onChange={(e) => setEdit(key, field, e.target.value)}
        />
      </div>
    )

    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>{furniture.name}</span>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>ID</label>
          <span className={styles.fieldValue}>{furniture.id}</span>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>In Room</label>
          <span className={styles.fieldValue}>{parentRoom?.type ?? '-'}</span>
        </div>
        <div className={styles.divider} />
        {numField('X', 'x', furniture.x)}
        {numField('Y', 'y', furniture.y)}
        {numField('Width', 'width', furniture.width)}
        {numField('Length', 'length', furniture.length)}
        {hasEdits && (
          <div className={styles.actions}>
            <button className={styles.saveBtn} onClick={() => saveFurniture(parentRoom!.id, furniture.id)} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className={styles.cancelBtn} onClick={() => cancelEdit(key)}>Cancel</button>
          </div>
        )}
      </div>
    )
  }

  return null
}