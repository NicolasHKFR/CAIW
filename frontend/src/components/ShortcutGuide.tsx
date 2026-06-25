import { useState, useEffect } from 'react'

const SHORTCUTS = [
  { key: 'Ctrl+Z', desc: 'Undo room move (2D canvas)' },
  { key: 'Ctrl+Shift+Z', desc: 'Redo room move (2D canvas)' },
  { key: 'Delete / Backspace', desc: 'Remove selected room (3D view)' },
  { key: '?', desc: 'Toggle this shortcut guide' },
]

export function ShortcutGuide() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)', fontFamily: 'Inter, sans-serif',
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          background: '#1e1e2e', borderRadius: 12, padding: 24, minWidth: 360,
          border: '1px solid #333', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 16px', color: '#fff', fontSize: 16, fontWeight: 600 }}>
          Keyboard Shortcuts
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SHORTCUTS.map((s) => (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#cdd6f4' }}>{s.desc}</span>
              <kbd style={{
                background: '#313244', color: '#cdd6f4', padding: '3px 8px',
                borderRadius: 4, fontSize: 12, fontFamily: 'var(--font-mono, monospace)',
                border: '1px solid #45475a',
              }}>
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 16, fontSize: 11, color: '#6c7086', textAlign: 'center' }}>
          Press <kbd style={{ background: '#313244', padding: '1px 6px', borderRadius: 3, fontSize: 11 }}>?</kbd> to close
        </p>
      </div>
    </div>
  )
}