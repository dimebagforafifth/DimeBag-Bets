import React from 'react'

const CSS = `
.sds-badge { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-label); font-size: 10.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; padding: 3px 9px; border-radius: var(--radius-pill); border: 1px solid transparent; }
.sds-badge--gold { color: var(--gold); border-color: color-mix(in srgb, var(--gold) 40%, transparent); background: color-mix(in srgb, var(--gold) 10%, transparent); }
.sds-badge--solid { color: var(--on-gold); background: var(--gold); }
.sds-badge--live { color: var(--green); border-color: color-mix(in srgb, var(--green) 40%, transparent); }
.sds-badge--live::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 30%, transparent); }
.sds-badge--neutral { color: var(--muted); border-color: var(--line); background: var(--surface-2); }
`
if (typeof document !== 'undefined' && !document.getElementById('sds-badge-css')) {
  const s = document.createElement('style')
  s.id = 'sds-badge-css'
  s.textContent = CSS
  document.head.appendChild(s)
}

/** A small status pill — Featured, Live, Provably fair, etc. */
export function Badge({ children, variant = 'gold', className = '', ...rest }) {
  return (
    <span className={['sds-badge', `sds-badge--${variant}`, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </span>
  )
}
