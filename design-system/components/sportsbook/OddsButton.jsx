import React from 'react'

const CSS = `
.sds-odds {
  display: flex; flex-direction: column; align-items: stretch; justify-content: center;
  gap: 2px; min-width: 64px; padding: 8px 10px; cursor: pointer;
  font-family: var(--font-body); background: var(--surface-2);
  border: 1px solid var(--line); border-radius: var(--radius-sm);
  transition: border-color var(--dur) ease, background var(--dur) ease, transform 0.05s ease;
}
.sds-odds:hover:not(:disabled) { border-color: color-mix(in srgb, var(--gold) 50%, var(--line)); }
.sds-odds:active:not(:disabled) { transform: translateY(1px); }
.sds-odds:focus-visible { outline: none; box-shadow: var(--ring); }
.sds-odds:disabled { opacity: 0.45; cursor: default; }
.sds-odds__label { font-size: 11px; color: var(--muted); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sds-odds__price { font-family: var(--font-num); font-variant-numeric: tabular-nums; font-weight: 700; font-size: 15px; color: var(--text); text-align: center; }
.sds-odds__move { font-size: 10px; text-align: center; height: 10px; line-height: 10px; }
.sds-odds__move.up { color: var(--green); }
.sds-odds__move.down { color: var(--red); }

/* selected — the one gold hit */
.sds-odds[aria-pressed="true"] {
  background: color-mix(in srgb, var(--gold) 14%, var(--surface-2));
  border-color: var(--gold);
}
.sds-odds[aria-pressed="true"] .sds-odds__price { color: var(--gold-bright); }
.sds-odds[aria-pressed="true"] .sds-odds__label { color: var(--gold); }
`
if (typeof document !== 'undefined' && !document.getElementById('sds-odds-css')) {
  const s = document.createElement('style')
  s.id = 'sds-odds-css'
  s.textContent = CSS
  document.head.appendChild(s)
}

/**
 * A single tappable odds cell for the sportsbook: a market label over a price.
 * Selected = the one gold hit. `move` shows a tiny ▲/▼ when a price drifts.
 */
export function OddsButton({ label, price, selected = false, move, disabled = false, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={['sds-odds', className].filter(Boolean).join(' ')}
      aria-pressed={selected}
      disabled={disabled}
      {...rest}
    >
      {label ? <span className="sds-odds__label">{label}</span> : null}
      <span className="sds-odds__price">{price}</span>
      <span className={`sds-odds__move ${move || ''}`}>{move === 'up' ? '▲' : move === 'down' ? '▼' : ''}</span>
    </button>
  )
}
