/**
 * The house pricing pipeline (SGO odds layer): raw feed price → house margin → manual
 * override wins.
 *
 * Every Selection carries two prices: `priceRaw` (exactly what the bookmaker posted) and
 * `priceDisplay` (what the player sees and a bet locks). `priceDisplay` is produced here:
 *
 *   1. RAW           — the bookmaker's American price, both notations filled.
 *   2. HOUSE MARGIN  — a haircut on the net winnings: displayDecimal = 1 + (rawDecimal − 1)
 *                      × (1 − margin). Monotonic, never drops below evens, sign-agnostic.
 *   3. MANUAL OVERRIDE — if an operator has set a line by hand, that price is returned
 *                      verbatim and the margin is SKIPPED. The poller reads the cache's
 *                      existing override and feeds it back here every cycle, so a manual
 *                      line is NEVER clobbered by the next poll (the raw price still
 *                      refreshes underneath, for the trader's reference).
 *
 * Pure + dependency-free so it tests in isolation and the contract stays standalone.
 */

import type { Price } from './contract.js'

/** Default book margin — the fractional haircut on net winnings (4.5%). */
export const DEFAULT_MARGIN = 0.045
const MAX_MARGIN = 0.5

/* ----------------------------- conversions ------------------------------ */

/** American → decimal (total-return multiplier). 0/invalid → 1.0 (no payout). */
export function decimalFromAmerican(american: number): number {
  if (american > 0) return 1 + american / 100
  if (american < 0) return 1 + 100 / -american
  return 1
}

/** Decimal → American (rounded to a whole price). decimal ≤ 1 → 0 (no payout). */
export function americanFromDecimal(decimal: number): number {
  if (decimal <= 1) return 0
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1))
}

/** Build a full Price from an American number (decimal derived). */
export function priceFromAmerican(american: number): Price {
  return { american, decimal: round(decimalFromAmerican(american), 4) }
}

/** Build a full Price from a decimal (American derived). */
export function priceFromDecimal(decimal: number): Price {
  return { american: americanFromDecimal(decimal), decimal: round(decimal, 4) }
}

/** A hand-set override price from an operator's American input. */
export function makeOverride(american: number): Price {
  return priceFromAmerican(american)
}

/* ------------------------------- margin --------------------------------- */

/** Apply the house margin to a raw price → a display price. Haircut on net winnings;
 *  the result never pays less than even money and preserves the price's sign behaviour. */
export function applyMargin(raw: Price, margin: number = DEFAULT_MARGIN): Price {
  const m = clamp(margin, 0, MAX_MARGIN)
  const displayDecimal = 1 + (raw.decimal - 1) * (1 - m)
  return priceFromDecimal(displayDecimal)
}

/* ------------------------------ pipeline -------------------------------- */

export interface PricingOptions {
  /** House margin to apply when there is no override. Defaults to DEFAULT_MARGIN. */
  margin?: number
  /** An operator's hand-set display price. When present it WINS — margin is skipped and
   *  this exact price becomes priceDisplay (the manual line is preserved across polls). */
  override?: Price | null
}

export interface PricedSelection {
  priceRaw: Price
  priceDisplay: Price
  /** True when `priceDisplay` came from a manual override (so the poller persists it). */
  override: boolean
}

/**
 * The full pipeline for one selection. `raw` is the feed price (always refreshed into
 * priceRaw). If `opts.override` is supplied it becomes priceDisplay untouched; otherwise
 * the house margin is applied to the raw price.
 */
export function applyPricing(raw: Price, opts: PricingOptions = {}): PricedSelection {
  const priceRaw = { american: raw.american, decimal: round(raw.decimal, 4) }
  if (opts.override) {
    return { priceRaw, priceDisplay: { ...opts.override }, override: true }
  }
  return { priceRaw, priceDisplay: applyMargin(priceRaw, opts.margin), override: false }
}

/* ------------------------------- helpers -------------------------------- */

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}
