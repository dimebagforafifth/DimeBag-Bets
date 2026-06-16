/**
 * Odds display + parlay math for the book UI lane. Self-contained (the FEED lane
 * owns pricing; this is just the read/display side the slip needs). All of it
 * works off the contract's decimal/american prices.
 *
 * Credit/balance only — `toReturnCents` / `profitCents` are integer cents through
 * `core`; nothing here implies cash value.
 */

import type { Price } from '../../lib/odds/contract.js'

/** A parlay can't be priced beyond ~299-to-1 (CLAUDE.md §4). */
export const MAX_PARLAY_DECIMAL = 300

/** American → decimal (e.g. −110 → 1.909, +150 → 2.5). */
export function decimalFromAmerican(american: number): number {
  return american > 0 ? american / 100 + 1 : 100 / -american + 1
}

/** Decimal → American (e.g. 2.5 → +150, 1.5 → −200). */
export function americanFromDecimal(decimal: number): number {
  if (decimal <= 1) return 0
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1))
}

/** "+150" / "−110" — the chip label. Uses a real minus sign for the VANTAGE type. */
export function formatAmerican(american: number): string {
  const n = Math.round(american)
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`
}

/** Implied win probability (0..1) from American odds — for the live-ish % readouts. */
export function impliedProbability(american: number): number {
  return american > 0 ? 100 / (american + 100) : -american / (-american + 100)
}

/** Combine leg decimals into a parlay price, capped at the house max. */
export function parlayDecimal(legDecimals: number[]): number {
  if (legDecimals.length === 0) return 1
  const product = legDecimals.reduce((acc, d) => acc * d, 1)
  return Math.min(product, MAX_PARLAY_DECIMAL)
}

/** Total returned (stake + profit) on a winning bet, in integer cents. */
export function toReturnCents(stakeCents: number, decimal: number): number {
  return Math.round(stakeCents * decimal)
}

/** Profit (return − stake) on a winning bet, in integer cents. */
export function profitCents(stakeCents: number, decimal: number): number {
  return toReturnCents(stakeCents, decimal) - stakeCents
}

/** The display price object for a leg, always read from `priceDisplay`. */
export function priceLabel(p: Price): string {
  return formatAmerican(p.american)
}
