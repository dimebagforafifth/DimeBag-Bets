/**
 * Small presentational helpers shared across the Profile v2 surfaces — money/percent/units
 * formatting and a few stateless cells. Pure presentation over the read-only projection; nothing
 * here touches a store or moves money. Consumes the global design tokens (app/theme.css).
 */

import type { ReactNode } from 'react'
import { formatMoney } from '../../games/shared/money.js'

/** Directional class for a signed cents figure (colour + the WCAG-safe "+" prefix below). */
export function moneyTone(cents: number): string {
  return cents > 0 ? 'is-up' : cents < 0 ? 'is-down' : 'is-even'
}

/** A signed money string — positive amounts get a "+" so profit/loss reads in text, not colour. */
export function signedMoney(cents: number): string {
  return cents > 0 ? `+${formatMoney(cents)}` : formatMoney(cents)
}

/** A signed percent from a fraction, e.g. 0.182 → "+18.2%". */
export function pct(fraction: number): string {
  return `${fraction >= 0 ? '+' : ''}${(fraction * 100).toFixed(1)}%`
}

/** Units with a sign + "u" suffix, e.g. 4.2 → "+4.20u". */
export function units(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}u`
}

export function StatCell({
  label,
  value,
  tone,
  big,
}: {
  label: string
  value: string
  tone?: string
  big?: boolean
}): ReactNode {
  return (
    <div className={`stat${big ? ' is-big' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone ?? ''}`}>{value}</span>
    </div>
  )
}

export function Pill({ tone, children }: { tone?: string; children: ReactNode }): ReactNode {
  return <span className={`prof-pill ${tone ?? ''}`}>{children}</span>
}

/** A locked-block placeholder shown where privacy hides content from a viewer. */
export function LockedBlock({ visibility }: { visibility: 'followers' | 'private' }): ReactNode {
  return (
    <div className="prof-locked" role="note">
      <span className="prof-locked-icon" aria-hidden="true">
        🔒
      </span>
      <span>{visibility === 'followers' ? 'Followers only' : 'Private'}</span>
    </div>
  )
}
