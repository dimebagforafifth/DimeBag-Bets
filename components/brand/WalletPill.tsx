import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import './brand.css'

export interface WalletPillProps {
  /** Pre-formatted headline balance string (e.g. "$8,420"). */
  balance: string
  /** Label over the headline balance. */
  label?: string
  /** Label over the week standing. */
  weekLabel?: string
  /** Week win/loss in cents — sign drives the arrow + colour. */
  weekCents: number
  /**
   * Format the week magnitude. The sign of `weekCents` still drives the arrow +
   * colour; this only controls the number string, so callers can preserve a
   * book's configured money display (symbol / decimals / locale). Defaults to "$X.XX".
   */
  formatWeek?: (cents: number) => string
  /** Optional trailing action rendered inside the wallet unit (e.g. a "Get points" button). */
  action?: ReactNode
  className?: string
}

function fmtCents(cents: number): string {
  return (
    '$' +
    Math.abs(cents / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

/**
 * The header "wallet" unit: the headline balance a player can bet right now, with
 * their week win/loss standing alongside as a plain up/down. `weekCents` drives the
 * arrow + colour automatically (up = green, down = red, even = silver).
 */
export function WalletPill({
  balance,
  label = 'Available',
  weekLabel = 'This week',
  weekCents,
  formatWeek,
  action,
  className,
}: WalletPillProps) {
  const tone = weekCents > 0 ? 'is-up' : weekCents < 0 ? 'is-down' : 'is-even'
  const arrow = weekCents > 0 ? '▲ ' : weekCents < 0 ? '▼ ' : ''
  const format = formatWeek ?? fmtCents
  return (
    <div className={cn('sds-wallet', className)}>
      <div className="sds-wallet__block sds-wallet__block--primary">
        <span className="sds-wallet__label">{label}</span>
        <span className="sds-wallet__value">{balance}</span>
      </div>
      <div className="sds-wallet__block">
        <span className="sds-wallet__label">{weekLabel}</span>
        <span className={cn('sds-wallet__value', tone)}>
          {weekCents === 0 ? 'Even' : `${arrow}${format(weekCents)}`}
        </span>
      </div>
      {action ? <div className="sds-wallet__action">{action}</div> : null}
    </div>
  )
}
