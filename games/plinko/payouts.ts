/**
 * Plinko payout tables + landing probabilities (CLAUDE.md §7).
 *
 * Unlike Keno/Dice (where we COMPUTE multipliers to hit a configured edge),
 * Plinko ships Stake's *published* multiplier tables verbatim — that's what was
 * asked for, and it's what players recognise. The fairness comes from the draw:
 * each peg is an independent 50/50, so a ball's landing slot follows a binomial
 * (Pascal's-triangle) distribution. We expose that probability and the realized
 * RTP so the edge is shown honestly (§4), not hidden.
 *
 * Tables are symmetric (slot 0 = far left … slot `rows` = far right) and run from
 * 8 to 16 rows at low / medium / high risk. Source: Stake's public Plinko paytable.
 */

export type PlinkoRisk = 'low' | 'medium' | 'high'
export const RISKS: PlinkoRisk[] = ['low', 'medium', 'high']

export const MIN_ROWS = 8
export const MAX_ROWS = 16

/**
 * Manager-configurable house edge (CLAUDE.md §4). Plinko ships *fixed* Stake
 * tables for normal play (what players recognise). The 99% RTP base IS those
 * clean numbers; when a manager changes the edge, `computePlinkoTable` scales
 * every multiplier proportionally to the new RTP. The default 1% is only consulted
 * once a manager opts in; until then the canonical tables are used unchanged.
 */
export interface PlinkoHouseConfig {
  /** House edge, e.g. 0.01 = 1%. */
  edge: number
}
export const DEFAULT_PLINKO_CONFIG: PlinkoHouseConfig = { edge: 0.01 }

/** rows → risk → multiplier per landing slot (length `rows + 1`). */
const TABLES: Record<number, Record<PlinkoRisk, number[]>> = {
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  },
  9: {
    low: [5.6, 2, 1.6, 1, 0.7, 0.7, 1, 1.6, 2, 5.6],
    medium: [18, 4, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4, 18],
    high: [43, 7, 2, 0.6, 0.2, 0.2, 0.6, 2, 7, 43],
  },
  10: {
    low: [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
    medium: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
    high: [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76],
  },
  11: {
    low: [8.4, 3, 1.9, 1.3, 1, 0.7, 0.7, 1, 1.3, 1.9, 3, 8.4],
    medium: [24, 6, 3, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3, 6, 24],
    high: [120, 14, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14, 120],
  },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
  },
  13: {
    low: [8.1, 4, 3, 1.9, 1.2, 0.9, 0.7, 0.7, 0.9, 1.2, 1.9, 3, 4, 8.1],
    medium: [43, 13, 6, 3, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3, 6, 13, 43],
    high: [260, 37, 11, 4, 1, 0.2, 0.2, 0.2, 0.2, 1, 4, 11, 37, 260],
  },
  14: {
    low: [7.1, 4, 1.9, 1.4, 1.3, 1.1, 1, 0.5, 1, 1.1, 1.3, 1.4, 1.9, 4, 7.1],
    medium: [58, 15, 7, 4, 1.9, 1, 0.5, 0.2, 0.5, 1, 1.9, 4, 7, 15, 58],
    high: [420, 56, 18, 5, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5, 18, 56, 420],
  },
  15: {
    low: [15, 8, 3, 2, 1.5, 1.1, 1, 0.7, 0.7, 1, 1.1, 1.5, 2, 3, 8, 15],
    medium: [88, 18, 11, 5, 3, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3, 5, 11, 18, 88],
    high: [620, 83, 27, 8, 3, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3, 8, 27, 83, 620],
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
}

function assertRows(rows: number): void {
  if (!Number.isInteger(rows) || rows < MIN_ROWS || rows > MAX_ROWS) {
    throw new Error(`rows must be an integer in ${MIN_ROWS}..${MAX_ROWS}, got ${rows}`)
  }
}

/** The multiplier table for a row count + risk (a fresh copy; never mutate). */
export function payouts(rows: number, risk: PlinkoRisk): number[] {
  assertRows(rows)
  return [...TABLES[rows][risk]]
}

/** Binomial coefficient C(n,k) — exact for our ranges (< 2^53). */
function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  k = Math.min(k, n - k)
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return Math.round(r)
}

/**
 * P(ball lands in each slot) for `rows` rows: slot i has C(rows,i)/2^rows — the
 * binomial from `rows` independent 50/50 pegs. Sums to 1.
 */
export function slotProbabilities(rows: number): number[] {
  assertRows(rows)
  const denom = 2 ** rows
  return Array.from({ length: rows + 1 }, (_, i) => comb(rows, i) / denom)
}

/** Realized RTP of a table: Σ P(slot)·multiplier(slot). ~0.97–0.99 on Stake's tables. */
export function rtpOf(rows: number, risk: PlinkoRisk): number {
  const p = slotProbabilities(rows)
  return payouts(rows, risk).reduce((acc, m, i) => acc + p[i] * m, 0)
}

/**
 * The base RTP anchor. At exactly this RTP the payout table IS the canonical Stake
 * table — its clean, recognisable (mostly whole) numbers. Every other RTP scales
 * those multipliers proportionally.
 */
export const BASE_RTP = 0.99

/**
 * The payout table for a target edge. The 99% base is the canonical Stake table
 * verbatim (clean numbers); any other RTP scales every multiplier proportionally:
 *
 *     m_i(rtp) = stake_i · (rtp / 0.99)        rtp = 1 − edge
 *
 * Because realized RTP is linear in the multipliers (RTP = Σ P·m), scaling them in
 * proportion moves the return in lockstep with the dial — at 99% it's exactly the
 * recognisable board, and as the edge rises (RTP falls toward 95%) every payout
 * shrinks in the same proportion. Rounded to 2dp; at the 99% base that's a no-op,
 * so the whole numbers are preserved. This is what the game settles on once a
 * manager changes the edge (§3).
 */
export function computePlinkoTable(
  rows: number,
  risk: PlinkoRisk,
  config: PlinkoHouseConfig = DEFAULT_PLINKO_CONFIG,
): number[] {
  const base = payouts(rows, risk) // canonical Stake table = the 99% anchor (validates rows)
  const scale = (1 - config.edge) / BASE_RTP
  return base.map((m) => Math.round(m * scale * 100) / 100)
}
