import React from 'react'

const CSS = `
.sds-stat { background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px 12px; }
.sds-stat__label { display: block; font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
.sds-stat__value { display: block; margin-top: 2px; font-family: var(--font-num); font-variant-numeric: tabular-nums; font-weight: 800; font-size: 18px; letter-spacing: -0.01em; color: var(--text); }
.sds-stat__value.is-hot { color: var(--gem); }
`
if (typeof document !== 'undefined' && !document.getElementById('sds-stat-css')) {
  const s = document.createElement('style')
  s.id = 'sds-stat-css'
  s.textContent = CSS
  document.head.appendChild(s)
}

/** A compact readout box — a labelled figure. `hot` paints the value gold (a live multiplier / treasure). */
export function Stat({ label, value, hot = false, className = '', ...rest }) {
  return (
    <div className={['sds-stat', className].filter(Boolean).join(' ')} {...rest}>
      <span className="sds-stat__label">{label}</span>
      <span className={`sds-stat__value ${hot ? 'is-hot' : ''}`}>{value}</span>
    </div>
  )
}
