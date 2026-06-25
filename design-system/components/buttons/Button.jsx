import React from 'react'

// Self-contained: inject the component's CSS once per page load. Styling hangs off
// the global Stadium tokens (styles.css), so the button re-themes with the system.
const CSS = `
.sds-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font-family: var(--font-body); font-weight: 700; letter-spacing: 0.2px;
  border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer;
  white-space: nowrap; text-decoration: none;
  transition: background var(--dur) ease, border-color var(--dur) ease,
    box-shadow var(--dur) ease, transform 0.05s ease, color var(--dur) ease;
}
.sds-btn:active:not(:disabled) { transform: translateY(1px); }
.sds-btn:disabled { opacity: 0.5; cursor: default; }
.sds-btn:focus-visible { outline: none; box-shadow: var(--ring); }

/* sizes */
.sds-btn--sm { padding: 8px 14px; font-size: var(--text-sm); }
.sds-btn--md { padding: 12px 20px; font-size: var(--text-md); }
.sds-btn--lg { padding: 14px 26px; font-size: var(--text-lg); }

/* the one confident gold CTA */
.sds-btn--primary { background: var(--gold); color: var(--on-gold); }
.sds-btn--primary:hover:not(:disabled) { background: var(--gold-bright); box-shadow: var(--elev-gold); }

/* quiet ghost — graphite surface, hairline border */
.sds-btn--ghost { background: var(--surface-2); color: var(--text); border-color: var(--line); }
.sds-btn--ghost:hover:not(:disabled) { border-color: color-mix(in srgb, var(--gold) 50%, var(--line)); background: var(--surface); }

/* text-only */
.sds-btn--text { background: transparent; color: var(--muted); }
.sds-btn--text:hover:not(:disabled) { color: var(--text); }

/* destructive / stop */
.sds-btn--danger { background: var(--red); color: #fff; }
.sds-btn--danger:hover:not(:disabled) { background: var(--red-press); }

.sds-btn--block { width: 100%; }
`
if (typeof document !== 'undefined' && !document.getElementById('sds-button-css')) {
  const s = document.createElement('style')
  s.id = 'sds-button-css'
  s.textContent = CSS
  document.head.appendChild(s)
}

/**
 * The Stadium button. One confident gold primary, a quiet ghost, a text variant
 * and a destructive "stop". Renders as <a> when `href` is given.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  href,
  className = '',
  ...rest
}) {
  const cls = [
    'sds-btn',
    `sds-btn--${variant}`,
    `sds-btn--${size}`,
    block ? 'sds-btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const Tag = href ? 'a' : 'button'
  return (
    <Tag className={cls} href={href} {...rest}>
      {children}
    </Tag>
  )
}
