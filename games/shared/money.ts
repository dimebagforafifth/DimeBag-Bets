/**
 * Money is stored everywhere as integer CENTS (1/100 of a point), so a
 * low-multiplier win settles to the penny (e.g. 1.01× on $10 → +$0.10) instead
 * of rounding to zero. Core's integer arithmetic is unchanged — cents are still
 * integers, so there's no float drift; only the unit and display shift.
 *
 * How points DISPLAY (symbol, position, locale, decimals) is operator-configurable
 * via `presentation.ts`; this stays the single formatter every UI calls. The
 * defaults reproduce the historical "$1,234.56" exactly, so nothing changes until a
 * manager white-labels it.
 */

import { moneyDisplay, type MoneyDisplay } from './presentation.js'

/** Cents in one display unit (a "$"). */
export const CENTS = 100

/** Format integer cents with an explicit display config (pure) — used for live
 *  previews of a not-yet-saved config. */
export function formatMoneyWith(cents: number, d: MoneyDisplay): string {
  const sign = cents < 0 ? '−' : ''
  const num = (Math.abs(cents) / CENTS).toLocaleString(d.locale, {
    minimumFractionDigits: d.decimals,
    maximumFractionDigits: d.decimals,
  })
  return d.symbolPosition === 'after' ? `${sign}${num} ${d.symbol}` : `${sign}${d.symbol}${num}`
}

/** Format integer cents as money to the operator's live display config: $1,234.56 / −$9.23. */
export function formatMoney(cents: number): string {
  return formatMoneyWith(cents, moneyDisplay())
}

/** Dollars (possibly fractional) → integer cents, clamped to ≥ 0 (for bet stakes). */
export function toCents(dollars: number): number {
  return Math.max(0, Math.round(dollars * CENTS))
}

/** Dollars → integer cents with the SIGN preserved (for a signed figure adjustment —
 *  a debit is negative). Unlike `toCents`, this never clamps to zero. */
export function toSignedCents(dollars: number): number {
  return Math.round(dollars * CENTS)
}

/** Integer cents → dollars, for editing a bet field. */
export function toDollars(cents: number): number {
  return cents / CENTS
}
