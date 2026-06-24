import styles from './ComfyStatus.module.css'

interface Props {
  connected: boolean
  checking: boolean
}

export function ComfyStatus({ connected, checking }: Props) {
  return (
    <span className={styles.wrapper}>
      {checking ? (
        <span className={styles.status}><span className={`${styles.dot} ${styles.checking}`} /> Comfy...</span>
      ) : !connected ? (
        <span className={styles.status}><span className={`${styles.dot} ${styles.disconnected}`} /> Comfy Offline</span>
      ) : (
        <span className={styles.status}><span className={`${styles.dot} ${styles.connected}`} /> Comfy Ready</span>
      )}
    </span>
  )
}
