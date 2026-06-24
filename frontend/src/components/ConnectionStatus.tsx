import styles from './ConnectionStatus.module.css'

interface Props {
  connected: boolean
  checking: boolean
  mockMode?: boolean
}

export function ConnectionStatus({ connected, checking, mockMode }: Props) {
  return (
    <span className={styles.wrapper}>
      {mockMode && <span className={styles.mockBadge}>MOCK</span>}
      {checking ? (
        <span className={styles.status}><span className={styles.dot + ' ' + styles.checking} /> Checking...</span>
      ) : !connected ? (
        <span className={styles.status}><span className={styles.dot + ' ' + styles.disconnected} /> Disconnected</span>
      ) : (
        <span className={styles.status}><span className={styles.dot + ' ' + styles.connected} /> Connected</span>
      )}
    </span>
  )
}
