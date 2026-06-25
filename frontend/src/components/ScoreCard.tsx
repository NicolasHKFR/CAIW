import { useState } from 'react'
import type { ScoreBreakdown } from '../types'

interface Props {
  score: ScoreBreakdown
}

const GRADES: Record<string, { color: string; label: string }> = {
  A: { color: '#22c55e', label: 'Excellent' },
  B: { color: '#eab308', label: 'Good' },
  C: { color: '#f97316', label: 'Fair' },
  D: { color: '#ef4444', label: 'Poor' },
}

const SUB_METRICS: { key: keyof ScoreBreakdown; label: string }[] = [
  { key: 'space_efficiency', label: 'Space Efficiency' },
  { key: 'circulation', label: 'Circulation' },
  { key: 'natural_light', label: 'Natural Light' },
  { key: 'proportions', label: 'Proportions' },
  { key: 'furniture_fit', label: 'Furniture Fit' },
]

export function ScoreCard({ score }: Props) {
  const [showAllWarnings, setShowAllWarnings] = useState(false)
  const gradeInfo = GRADES[score.grade] ?? GRADES.D
  const radius = 60
  const strokeWidth = 12
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score.overall / 100) * circumference

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <svg width={radius * 2 + strokeWidth * 2} height={radius * 2 + strokeWidth * 2}>
          <circle
            cx={radius + strokeWidth}
            cy={radius + strokeWidth}
            r={radius}
            fill="none"
            stroke="#2a2a4a"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={radius + strokeWidth}
            cy={radius + strokeWidth}
            r={radius}
            fill="none"
            stroke={gradeInfo.color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${radius + strokeWidth} ${radius + strokeWidth})`}
            style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
          />
          <text
            x={radius + strokeWidth}
            y={radius + strokeWidth - 8}
            textAnchor="middle"
            fill="#eaeaea"
            fontSize="28"
            fontWeight="700"
            fontFamily="Inter, sans-serif"
          >
            {Math.round(score.overall)}
          </text>
          <text
            x={radius + strokeWidth}
            y={radius + strokeWidth + 16}
            textAnchor="middle"
            fill={gradeInfo.color}
            fontSize="18"
            fontWeight="600"
            fontFamily="Inter, sans-serif"
          >
            {score.grade}
          </text>
        </svg>
        <span style={{ position: 'absolute', bottom: -4, fontSize: 11, color: '#a0a0b0' }}>
          {gradeInfo.label}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SUB_METRICS.map((m) => {
          const val = score[m.key] as number
          const barColor = val >= 80 ? '#22c55e' : val >= 60 ? '#eab308' : '#ef4444'
          return (
            <div key={m.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: '#a0a0b0' }}>{m.label}</span>
                <span style={{ color: '#eaeaea', fontWeight: 600 }}>{Math.round(val)}%</span>
              </div>
              <div style={{ height: 6, background: '#2a2a4a', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${val}%`,
                    background: barColor,
                    borderRadius: 3,
                    transition: 'width 0.8s ease-in-out',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {score.warnings.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 11, color: '#eab308', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Warnings
          </div>
          {(showAllWarnings ? score.warnings : score.warnings.slice(0, 3)).map((w, i) => (
            <div key={i} style={{ fontSize: 12, color: '#a0a0b0', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {w}
            </div>
          ))}
          {score.warnings.length > 3 && (
            <button
              onClick={() => setShowAllWarnings(!showAllWarnings)}
              style={{
                background: 'none', border: 'none', color: '#e94560', cursor: 'pointer',
                fontSize: 12, padding: '6px 0', fontFamily: 'Inter, sans-serif',
              }}
            >
              {showAllWarnings ? 'Show less' : `Show all (${score.warnings.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
