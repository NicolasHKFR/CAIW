import { useSceneStore } from '../store/sceneStore'
import { hashColor } from '../constants'
import styles from './ToolPanel.module.css'

export function ToolPanel() {
  const {
    definition, activeFloor, showWalls, showLabels, showGrid, showDimensions,
    showDoors, showWindows,
    selection, selectObject,
    setActiveFloor, toggleWalls, toggleLabels, toggleGrid, toggleDimensions,
    toggleDoors, toggleWindows, mode, setMode,
  } = useSceneStore()

  const rooms = definition?.rooms ?? []
  const floors = [...new Set(rooms.map(r => r.floor))].sort((a, b) => a - b)
  const floorRooms = rooms.filter(r => r.floor === activeFloor)

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <label className={styles.sectionTitle}>View Mode</label>
        <div className={styles.modeRow}>
          <button
            className={`${styles.modeBtn} ${mode === 'house' ? styles.modeActive : ''}`}
            onClick={() => setMode('house')}
          >
            House
          </button>
          <button
            className={`${styles.modeBtn} ${mode === 'furniture' ? styles.modeActive : ''}`}
            onClick={() => setMode('furniture')}
          >
            Furniture
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.sectionTitle}>Floor</label>
        <div className={styles.floorRow}>
          {floors.map(f => (
            <button
              key={f}
              className={`${styles.floorBtn} ${f === activeFloor ? styles.floorActive : ''}`}
              onClick={() => setActiveFloor(f)}
            >
              {f === 0 ? 'B' : f === 1 ? 'G' : `F${f}`}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.sectionTitle}>Rooms</label>
        <div className={styles.roomList}>
          {floorRooms.length === 0 && (
            <span className={styles.emptyText}>No rooms on this floor</span>
          )}
          {floorRooms.map(r => (
            <button
              key={r.id}
              className={`${styles.roomItem} ${selection.objectId === r.id ? styles.roomSelected : ''}`}
              onClick={() => selectObject(r.id, 'room')}
            >
              <span className={styles.roomDot} style={{ background: hashColor(r.id) }} />
              <span className={styles.roomLabel}>{r.type}</span>
              <span className={styles.roomId}>{r.id}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.sectionTitle}>Visibility</label>
        <label className={styles.toggleRow}>
          <input type="checkbox" checked={showWalls} onChange={toggleWalls} />
          <span>Walls</span>
        </label>
        <label className={styles.toggleRow}>
          <input type="checkbox" checked={showLabels} onChange={toggleLabels} />
          <span>Labels</span>
        </label>
        <label className={styles.toggleRow}>
          <input type="checkbox" checked={showGrid} onChange={toggleGrid} />
          <span>Grid</span>
        </label>
        <label className={styles.toggleRow}>
          <input type="checkbox" checked={showDimensions} onChange={toggleDimensions} />
          <span>Dimensions</span>
        </label>
        <label className={styles.toggleRow}>
          <input type="checkbox" checked={showDoors} onChange={toggleDoors} />
          <span>Doors</span>
        </label>
        <label className={styles.toggleRow}>
          <input type="checkbox" checked={showWindows} onChange={toggleWindows} />
          <span>Windows</span>
        </label>
      </div>
    </div>
  )
}
