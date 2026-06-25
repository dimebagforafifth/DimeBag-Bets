import React from 'react'

const CSS = `
.sds-chip {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-num); font-variant-numeric: tabular-nums;
  background: var(--surface-2); border: 1px solid var(--line); color: var(--muted);
  border-radius: var(--radius-sm); padding: 5px 10px; font-size: var(--text-xs);
  cursor: pointer; transition: color var(--dur) ease, border-color var(--dur) ease, background var(--dur) ease;
}
.sds-chip:hover:not(:disabled) { color: var(--text); }
.sds-chip[aria-pressed="true"], .sds-chip.is-on {
  color: var(--gem); border-color: rgba(var(--gem-glow), 0.4);
  background: color-mix(in srgb, var(--gem) 8%, var(--surface-2));
}
.sds-chip:disabled { opacity: 0.5; cursor: default; }
.sds-chip:focus-visible { outline: none; box-shadow: var(--ring); }
`
if (typeof document !== 'undefined' && !document.getElementById('sds-chip-css')) {
  const s = document.createElement('style')
  s.id = 'sds-chip-css'
  s.textContent = CSS
  document.head.appendChild(s)
}

/**
 * A small selectable token — bet presets (½, 2×, Max), quick filters. Gold-gem
 * highlight when `active`.
 */
export function Chip({ children, active = false, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={['sds-chip', className].filter(Boolean).join(' ')}
      aria-pressed={active}
      {...rest}
    >
      {children}
    </button>
  )
}
