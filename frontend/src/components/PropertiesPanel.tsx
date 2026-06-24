import { useSceneStore } from '../store/sceneStore'
import { hashColor } from './RoomMesh'
import styles from './PropertiesPanel.module.css'

export function PropertiesPanel() {
  const { definition, selection } = useSceneStore()

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

  const rooms = definition?.rooms ?? []

  if (selection.objectType === 'room') {
    const room = rooms.find(r => r.id === selection.objectId)
    if (!room) return <div className={styles.panel}><span className={styles.emptyText}>Room not found</span></div>

    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.colorDot} style={{ background: hashColor(room.id) }} />
          <span className={styles.title}>{room.type}</span>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>ID</label>
          <span className={styles.fieldValue}>{room.id}</span>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Type</label>
          <span className={styles.fieldValue}>{room.type}</span>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Floor</label>
          <span className={styles.fieldValue}>{room.floor ?? '-'}</span>
        </div>

        <div className={styles.divider} />

        {room.x != null && (
          <div className={styles.field}>
            <label className={styles.fieldLabel}>X</label>
            <span className={styles.fieldValue}>{room.x.toFixed(2)} m</span>
          </div>
        )}
        {room.y != null && (
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Y</label>
            <span className={styles.fieldValue}>{room.y.toFixed(2)} m</span>
          </div>
        )}
        {room.w != null && (
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Width</label>
            <span className={styles.fieldValue}>{room.w.toFixed(2)} m</span>
          </div>
        )}
        {room.h != null && (
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Length</label>
            <span className={styles.fieldValue}>{room.h.toFixed(2)} m</span>
          </div>
        )}
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
      </div>
    )
  }

  if (selection.objectType === 'furniture') {
    const parentRoom = rooms.find(r => r.id === selection.roomParentId)
    const furniture = parentRoom?.furniture?.find(f => f.id === selection.objectId)
    if (!furniture) return <div className={styles.panel}><span className={styles.emptyText}>Furniture not found</span></div>

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

        <div className={styles.field}>
          <label className={styles.fieldLabel}>X</label>
          <span className={styles.fieldValue}>{furniture.x.toFixed(2)} m</span>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Y</label>
          <span className={styles.fieldValue}>{furniture.y.toFixed(2)} m</span>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Width</label>
          <span className={styles.fieldValue}>{furniture.width.toFixed(2)} m</span>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Length</label>
          <span className={styles.fieldValue}>{furniture.length.toFixed(2)} m</span>
        </div>
      </div>
    )
  }

  return null
}
