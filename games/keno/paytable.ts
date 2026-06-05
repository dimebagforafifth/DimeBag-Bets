/**
 * Keno paytable + house edge (CLAUDE.md §7).
 *
 * Rather than hardcode Stake's published tables, the multipliers are COMPUTED
 * from the exact hypergeometric hit probabilities so the realized RTP equals
 * (1 − edge) by construction — the vig is provably correct and manager-
 * configurable. Risk levels reshape only the volatility (which hit-counts pay
 * and how steeply), never the edge.
 *
 * For a given pick count, the only paying hit-counts are the higher ones; we
 * scale a risk-shaped weight so Σ P(hits)·mult(hits) = (1 − edge), and raise the
 * paying threshold until the lowest paying tier clears 1.1× (so a "win" always
 * returns more than the stake — keeping the core money model clean, §3).
 */

export type KenoRisk = 'classic' | 'low' | 'medium' | 'high'
export const RISKS: KenoRisk[] = ['classic', 'low', 'medium', 'high']

export interface KenoHouseConfig {
  /** House edge, e.g. 0.01 = 1%. Manager-configurable. */
  edge: number
}
export const DEFAULT_KENO_CONFIG: KenoHouseConfig = { edge: 0.01 }

const GRID = 40
const DRAWN = 10
const MAX_MULT = 50000 // payout cap — only ever trims astronomically rare tiers
const MIN_PAY = 1.1 // a paying tier must return more than the stake

/** Binomial coefficient C(n,k) — exact for our ranges (< 2^53). */
function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  k = Math.min(k, n - k)
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return Math.round(r)
}

/** P(exactly h of your `picks` numbers are among the 10 drawn). */
export function hitProbabilities(picks: number): number[] {
  const total = comb(GRID, picks)
  const probs: number[] = []
  for (let h = 0; h <= picks; h++) {
    probs[h] = (comb(DRAWN, h) * comb(GRID - DRAWN, picks - h)) / total
  }
  return probs
}

const EXPONENT: Record<KenoRisk, number> = {
  low: 1.1,
  classic: 1.6,
  medium: 2.2,
  high: 3.2,
}
const THRESHOLD: Record<KenoRisk, number> = {
  low: 0.25,
  classic: 0.3,
  medium: 0.4,
  high: 0.55,
}

/**
 * The paytable for a pick count + risk under a house config: an array indexed
 * by hit-count (0..picks); 0 means no payout, otherwise the win multiplier.
 */
export function buildPaytable(
  picks: number,
  risk: KenoRisk,
  config: KenoHouseConfig = DEFAULT_KENO_CONFIG,
): number[] {
  if (!Number.isInteger(picks) || picks < 1 || picks > 10) {
    throw new Error(`picks must be an integer in 1..10, got ${picks}`)
  }
  const probs = hitProbabilities(picks)
  const target = 1 - config.edge
  const expo = EXPONENT[risk]
  let minHit = Math.min(picks, Math.max(1, Math.round(picks * THRESHOLD[risk])))

  for (;;) {
    let denom = 0
    for (let h = minHit; h <= picks; h++) denom += probs[h] * Math.pow(h - minHit + 1, expo)
    const k = target / denom

    const table = new Array(picks + 1).fill(0)
    for (let h = minHit; h <= picks; h++) {
      table[h] = Math.min(MAX_MULT, k * Math.pow(h - minHit + 1, expo))
    }

    if (table[minHit] >= MIN_PAY || minHit === picks) {
      return table.map((m) => (m > 0 ? Math.round(m * 100) / 100 : 0))
    }
    minHit++ // lowest tier paid too little — drop it and re-scale
  }
}

/** The realized RTP of a (rounded, capped) paytable — Σ P(h)·mult(h). */
export function rtpOf(picks: number, risk: KenoRisk, config: KenoHouseConfig = DEFAULT_KENO_CONFIG): number {
  const probs = hitProbabilities(picks)
  const table = buildPaytable(picks, risk, config)
  return table.reduce((acc, m, h) => acc + probs[h] * m, 0)
}
