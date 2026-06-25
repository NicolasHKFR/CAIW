import { Html } from '@react-three/drei'

const SWATCH_COLORS = [
  '#e8dcc8', '#c8d8e8', '#d4e8c8', '#f0d0d0', '#d0d0f0', '#f0e8c0',
  '#e06040', '#4080c0', '#60a050', '#c06080', '#8060b0', '#d0a040',
]

const SWATCH_SIZE = 28
const SWATCH_GAP = 6
const COLS = 6

export interface MaterialSwatchProps {
  onSelect: (color: string) => void
  onReset: () => void
  visible: boolean
}

export function MaterialSwatch({ onSelect, onReset, visible }: MaterialSwatchProps) {
  if (!visible) return null

  const panelW = COLS * (SWATCH_SIZE + SWATCH_GAP) + 12

  return (
    <Html
      position={[0, 2, 0]}
      style={{
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          background: 'rgba(0,0,0,0.7)',
          borderRadius: 8,
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          width: panelW,
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, ${SWATCH_SIZE}px)`,
            gap: SWATCH_GAP,
          }}
        >
          {SWATCH_COLORS.map((color) => (
            <button
              key={color}
              title={color}
              onClick={() => onSelect(color)}
              style={{
                width: SWATCH_SIZE,
                height: SWATCH_SIZE,
                background: color,
                border: '2px solid rgba(255,255,255,0.2)',
                borderRadius: 4,
                cursor: 'pointer',
                padding: 0,
                outline: 'none',
                transition: 'border-color 0.15s, transform 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#fff'
                e.currentTarget.style.transform = 'scale(1.15)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
                e.currentTarget.style.transform = 'scale(1)'
              }}
            />
          ))}
        </div>
        <button
          onClick={onReset}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 4,
            color: '#ccc',
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'Inter, sans-serif',
            padding: '4px 0',
            width: '100%',
          }}
        >
          Reset colors
        </button>
      </div>
    </Html>
  )
}
