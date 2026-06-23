/**
 * Cumulative-P&L line chart — a small dependency-free SVG (same approach as the CRM sparkline).
 * It renders the projection's `pnl` curve: running net over time, with a zero baseline so a green
 * line above / red line below reads at a glance. Pure presentation — it draws the numbers the
 * projection hands it and computes nothing about money.
 */

import type { ReactNode } from 'react'
import type { PnlPoint } from '../projection.js'
import { signedMoney } from './bits.js'

/** Build the line + area paths and the zero-baseline y, in a 0..100 viewBox. */
function paths(values: number[]): { line: string; area: string; zeroY: number } | null {
  if (values.length < 2) return null
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const span = max - min || 1
  const x = (i: number): number => (i / (values.length - 1)) * 100
  const y = (v: number): number => 100 - ((v - min) / span) * 100
  const line = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`)
    .join(' ')
  const area = `${line} L100 100 L0 100 Z`
  return { line, area, zeroY: y(0) }
}

export function PnlChart({
  pnl,
  label = 'Cumulative P&L',
}: {
  pnl: PnlPoint[]
  label?: string
}): ReactNode {
  const values = pnl.map((p) => p.cumulative)
  const p = paths(values)
  const final = values.length ? values[values.length - 1] : 0
  const tone = final > 0 ? 'is-up' : final < 0 ? 'is-down' : 'is-even'

  return (
    <div className="prof-chart">
      <div className="prof-chart-head">
        <span className="prof-chart-label">{label}</span>
        <span className={`prof-chart-final ${tone}`}>{signedMoney(final)}</span>
      </div>
      {p ? (
        <svg
          className={`prof-chart-svg ${tone}`}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${label}: ${signedMoney(final)} over ${pnl.length} settled bets`}
        >
          <line
            className="prof-chart-zero"
            x1="0"
            y1={p.zeroY.toFixed(2)}
            x2="100"
            y2={p.zeroY.toFixed(2)}
          />
          <path className="prof-chart-area" d={p.area} />
          <path className="prof-chart-line" d={p.line} />
        </svg>
      ) : (
        <div className="prof-chart-empty">Not enough settled bets to chart yet.</div>
      )}
    </div>
  )
}
