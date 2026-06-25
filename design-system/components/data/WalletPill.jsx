import React from 'react'

const CSS = `
.sds-wallet { display: inline-flex; align-items: stretch; gap: 14px; padding: 6px 14px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--sheen); }
.sds-wallet__block { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2; }
.sds-wallet__block + .sds-wallet__block { padding-left: 14px; border-left: 1px solid var(--line); }
.sds-wallet__label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.7px; color: var(--faint); }
.sds-wallet__value { font-family: var(--font-num); font-variant-numeric: tabular-nums; font-weight: 700; font-size: 13px; color: var(--text); letter-spacing: -0.01em; }
.sds-wallet__block--primary .sds-wallet__value { font-size: 16px; color: var(--gold-bright); }
.sds-wallet__value.is-up { color: var(--green); }
.sds-wallet__value.is-down { color: var(--red); }
.sds-wallet__value.is-even { color: var(--muted); font-weight: 600; }
`
if (typeof document !== 'undefined' && !document.getElementById('sds-wallet-css')) {
  const s = document.createElement('style')
  s.id = 'sds-wallet-css'
  s.textContent = CSS
  document.head.appendChild(s)
}

/**
 * The header "wallet" unit: the headline balance a player can bet right now, with
 * their week win/loss standing alongside as a plain up/down. `weekCents` drives the
 * arrow + colour automatically.
 */
export function WalletPill({ balance, label = 'Available', weekLabel = 'This week', weekCents }) {
  const tone = weekCents > 0 ? 'is-up' : weekCents < 0 ? 'is-down' : 'is-even'
  const arrow = weekCents > 0 ? '▲ ' : weekCents < 0 ? '▼ ' : ''
  const fmt = (c) => '$' + Math.abs(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div className="sds-wallet">
      <div className="sds-wallet__block sds-wallet__block--primary">
        <span className="sds-wallet__label">{label}</span>
        <span className="sds-wallet__value">{balance}</span>
      </div>
      <div className="sds-wallet__block">
        <span className="sds-wallet__label">{weekLabel}</span>
        <span className={`sds-wallet__value ${tone}`}>{weekCents === 0 ? 'Even' : `${arrow}${fmt(weekCents)}`}</span>
      </div>
    </div>
  )
}
