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

import type { MarketType, Price } from './contract.js'

/** Default book margin — the fractional haircut on net winnings (4.5%). */
export const DEFAULT_MARGIN = 0.045
/** The hard ceiling on any configured margin — no book runs more than 50% juice. */
export const MAX_MARGIN = 0.5

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

/* ------------------- configurable margin (per market) ------------------- */
/*
 * The Pinnacle-vs-recreational knob. The margin above is a single fixed rate; a real
 * operator wants to set their HOLD POSTURE as a SETTING — fat juice on a soft book, or
 * thin juice / high limits to court sharper action — and to run different juice on
 * different market types (props always carry more than the main lines). `MarginConfig`
 * makes the RATE configurable while the margin MATH (`applyMargin`) is untouched: the
 * caller resolves which rate a given market gets, then hands it to the same pipeline. The
 * correlated-SGP pricing below is unaffected — it still takes a single `margin` and now
 * simply receives the resolved per-market rate instead of a hard-coded constant.
 */

/**
 * An operator's hold posture: a `base` margin for any market, plus optional per-market
 * overrides. Every rate is the same fractional haircut `applyMargin` consumes — only WHICH
 * rate a market gets is configurable. A market absent from `perMarket` uses `base`.
 */
export interface MarginConfig {
  /** The operator's default house margin (fractional haircut on net winnings). */
  base: number
  /** Per-market-type overrides; a market not listed falls back to `base`. */
  perMarket?: Partial<Record<MarketType, number>>
}

/** Named hold postures an operator picks as a starting point, then fine-tunes. */
export type MarginPosture = 'recreational' | 'balanced' | 'sharp'

/**
 * Starting presets. RECREATIONAL runs fat juice (soft players, lower limits); SHARP runs
 * thin juice (low-margin / high-limit, Pinnacle style); BALANCED is the legacy flat
 * DEFAULT_MARGIN. Recreational/sharp run props a touch fatter than the main lines, mirroring
 * real books; an operator can override any market after adopting a posture.
 */
export const MARGIN_POSTURES: Readonly<Record<MarginPosture, MarginConfig>> = {
  recreational: { base: 0.065, perMarket: { prop: 0.085 } },
  balanced: { base: DEFAULT_MARGIN },
  sharp: { base: 0.02, perMarket: { prop: 0.03 } },
}

/** The default operator config: the legacy flat DEFAULT_MARGIN on every market, so a book
 *  with no posture configured prices byte-for-byte as it did before this control existed. */
export const DEFAULT_MARGIN_CONFIG: MarginConfig = { base: DEFAULT_MARGIN }

/**
 * The margin to apply to ONE market: its per-market override if set, otherwise the config's
 * base, otherwise (no config at all) DEFAULT_MARGIN. Always clamped to [0, MAX_MARGIN]. Pure.
 */
export function resolveMargin(config: MarginConfig | undefined, market?: MarketType): number {
  if (!config) return DEFAULT_MARGIN
  const override = market != null ? config.perMarket?.[market] : undefined
  return clamp(override ?? config.base, 0, MAX_MARGIN)
}

/* ------------------- correlated same-game parlay (SGP) ------------------ */
/*
 * A same-game parlay's legs are NOT independent — a team winning correlates with it
 * covering the spread and going over the total; a QB's passing yards correlate with the
 * team total. Pricing those legs as independent (just multiplying the displayed prices)
 * OVERPAYS, because the true joint probability of correlated legs is higher than the
 * product of the marginals. The model below prices it honestly:
 *
 *   1. STRIP THE VIG   — de-vig each leg's market to a true marginal probability.
 *   2. JOINT W/ ρ      — combine the marginals with a conservative per-sport correlation
 *                        ρ (NOT a plain product), so the joint reflects co-occurrence.
 *   3. RE-APPLY MARGIN — one house margin on the fair joint price (never N stacked).
 *   4. CAP             — the 299-to-1 ceiling, and never more generous than independent.
 *
 * Pure + dependency-free, like the rest of this file.
 */

/** Max legs allowed in a same-game parlay (configurable; the price cap still applies). */
export const SGP_MAX_LEGS = 10
/** Price ceiling — the ~299-to-1 house cap (CLAUDE.md §4). */
export const MAX_SGP_DECIMAL = 300
/** Correlation used when a sport isn't in the matrix below. */
export const DEFAULT_SGP_CORRELATION = 0.08

/**
 * Conservative DEFAULT positive correlation between two same-game legs, by SGO sportID.
 * Higher ρ = legs co-occur more, so the JOINT probability sits further above the
 * independent product and the fair SGP price is SHORTER. These are deliberately modest,
 * house-safe scalars (a per-sport default, not a full per-market-pair matrix). Tune per
 * book appetite; raising a sport's ρ shortens every SGP in that sport.
 */
export const SPORT_CORRELATION: Readonly<Record<string, number>> = {
  FOOTBALL: 0.12,
  BASKETBALL: 0.1,
  BASEBALL: 0.06,
  HOCKEY: 0.06,
  SOCCER: 0.1,
  MMA: 0.05,
}

/** The correlation factor for a sport (case-insensitive), clamped to a sane [0, 0.6]. */
export function correlationForSport(sport: string | undefined): number {
  const rho = SPORT_CORRELATION[(sport ?? '').toUpperCase()] ?? DEFAULT_SGP_CORRELATION
  return clamp(rho, 0, 0.6)
}

/** Implied win probability (0..1) from an American price. 0/invalid → 0. */
export function impliedProbability(american: number): number {
  if (american > 0) return 100 / (american + 100)
  if (american < 0) return -american / (-american + 100)
  return 0
}

/**
 * De-vig a market: turn each side's RAW implied probability into a TRUE probability by
 * removing the book's overround (normalize so the sides sum to 1). Order is preserved.
 * A single-/zero-sum market returns the raw implied prob(s) unchanged (nothing to
 * normalize against). Use the RAW prices here — the house margin is re-applied once, at
 * the parlay level, so de-vigging the display price would double-count it.
 */
export function devig(rawAmericans: number[]): number[] {
  const implied = rawAmericans.map(impliedProbability)
  const total = implied.reduce((a, b) => a + b, 0)
  if (total <= 0) return implied
  return implied.map((p) => p / total)
}

/**
 * The JOINT probability of N correlated legs from their TRUE (de-vigged) marginals and a
 * correlation factor ρ. Folds legs pairwise with the exact two-Bernoulli identity
 * P(A∩B) = pA·pB + ρ·√(pA(1−pA)·pB(1−pB))  and clamps each step to the Fréchet bounds
 * [max(0, pA+pB−1), min(pA,pB)], so the result is always a valid joint probability. For
 * ρ ≥ 0 the joint sits ≥ the independent product (legs co-occur → SGP shortens); for ρ < 0
 * (opposing-direction legs, e.g. a 1st-half UNDER with a full-game OVER) the joint sits
 * BELOW the product, so the fair SGP price LENGTHENS — the negative-correlation case books
 * price longer. ρ is clamped to [−0.95, 0.95].
 */
export function correlatedJoint(probs: number[], rho: number): number {
  if (probs.length === 0) return 1
  const r = clamp(rho, -0.95, 0.95)
  let joint = clamp(probs[0], 0, 1)
  for (let i = 1; i < probs.length; i++) {
    const p = clamp(probs[i], 0, 1)
    const cov = r * Math.sqrt(joint * (1 - joint) * p * (1 - p))
    const lo = Math.max(0, joint + p - 1)
    const hi = Math.min(joint, p)
    joint = clamp(joint * p + cov, lo, hi)
  }
  return joint
}

export interface SgpQuote {
  /** Independent product of the true marginals (the naive baseline). */
  independentProb: number
  /** Correlation-adjusted joint probability (≥ independentProb for ρ ≥ 0). */
  jointProb: number
  /** The correlation factor used. */
  rho: number
  /** Fair decimal from the joint probability (no margin). */
  fairDecimal: number
  /** The PRICED decimal the player gets: fair × house margin, capped. */
  decimal: number
  /** Same in American notation. */
  american: number
}

/**
 * Price a same-game parlay from its legs' TRUE (de-vigged) marginal probabilities:
 * joint-with-correlation → re-apply ONE house margin → cap. `independentDisplayDecimal`
 * (the naive product of the legs' already-margined display prices) is an OPTIONAL upper
 * safety rail: when passed (the same-direction case), the SGP price is never MORE generous
 * than the independent legs, so positive correlation can only SHORTEN. Omit it for the
 * negative-correlation (opposing-direction) case, where the fair joint legitimately prices
 * LONGER than independent. ρ may be negative (clamped to [−0.95, 0.95]).
 */
export function priceSgp(
  trueProbs: number[],
  opts: { rho?: number; margin?: number; independentDisplayDecimal?: number } = {},
): SgpQuote {
  const rho = clamp(opts.rho ?? DEFAULT_SGP_CORRELATION, -0.95, 0.95)
  const independentProb = trueProbs.reduce((acc, p) => acc * clamp(p, 0, 1), 1)
  const joint = correlatedJoint(trueProbs, rho)
  const safeJoint = joint > 0 ? joint : independentProb > 0 ? independentProb : 1
  const fairDecimal = 1 / safeJoint
  let decimal = applyMargin(priceFromDecimal(fairDecimal), opts.margin).decimal
  if (opts.independentDisplayDecimal && opts.independentDisplayDecimal > 1) {
    decimal = Math.min(decimal, opts.independentDisplayDecimal)
  }
  decimal = Math.min(decimal, MAX_SGP_DECIMAL)
  return {
    independentProb,
    jointProb: safeJoint,
    rho,
    fairDecimal: round(fairDecimal, 4),
    decimal: round(decimal, 4),
    american: americanFromDecimal(decimal),
  }
}

/* ------------------------------- helpers -------------------------------- */

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}
