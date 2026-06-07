/**
 * Diamonds paytable + house edge (CLAUDE.md §4, §7).
 *
 * Five gems are dealt, each one of 8 colours uniformly & independently — so the
 * hand is just a multinomial over 8 colours in 5 draws (denominator 8^5 = 32768).
 * The payout depends ONLY on the multiset COUNT PATTERN of the colours:
 *
 *   pattern (sorted counts)   name          exact count (of 32768)
 *   [5]                       five          8
 *   [4,1]                     four          280
 *   [3,2]                     full house    560
 *   [3,1,1]                   three         3360
 *   [2,2,1]                   two pair      5040
 *   [2,1,1,1]                 pair          16800
 *   [1,1,1,1,1]               none          6720
 *
 * Rather than hardcode a table, the multipliers are COMPUTED from those exact
 * probabilities so the realized RTP equals (1 − edge) by construction — the vig
 * is provably correct and manager-configurable (like Keno/Wheel). Rarer patterns
 * get bigger relative WEIGHTS; we scale by a single k so Σ P(pattern)·mult = (1 −
 * edge). 'none' always pays 0×; every PAYING tier is kept above 1× by dropping
 * the lowest paying tier and re-scaling (Keno's loop), so a "win" always beats
 * the stake — keeping the core money model clean (§3).
 */

/** The seven count-patterns, named. Order is rarest → commonest among the
 *  paying tiers, then 'none' (which never pays). */
export type Pattern = 'five' | 'four' | 'fullHouse' | 'three' | 'twoPair' | 'pair' | 'none'

/** All patterns, ordered rarest → commonest (paying tiers first, 'none' last). */
export const PATTERNS: Pattern[] = ['five', 'four', 'fullHouse', 'three', 'twoPair', 'pair', 'none']

/** Human-readable labels for the UI legend. */
export const PATTERN_LABELS: Record<Pattern, string> = {
  five: 'Five of a kind',
  four: 'Four of a kind',
  fullHouse: 'Full house',
  three: 'Three of a kind',
  twoPair: 'Two pair',
  pair: 'Pair',
  none: 'No match',
}

export interface DiamondsHouseConfig {
  /** House edge, e.g. 0.01 = 1%. Manager-configurable. */
  edge: number
}
export const DEFAULT_DIAMONDS_CONFIG: DiamondsHouseConfig = { edge: 0.01 }

const DENOM = 8 ** 5 // 32768
const MIN_PAY = 1.1 // a paying tier must return more than the stake

/** Exact multinomial counts of each pattern (out of 8^5 = 32768). */
const PATTERN_COUNTS: Record<Pattern, number> = {
  five: 8, //  8·1
  four: 280, //  8·7·5
  fullHouse: 560, //  8·7·10
  three: 3360, //  8·C(7,2)·20
  twoPair: 5040, //  C(8,2)·6·30
  pair: 16800, //  8·C(7,3)·60
  none: 6720, //  8·7·6·5·4
}

/** Relative payout weights — rarer patterns are weighted bigger, so the table
 *  ramps with rarity. Scaled by a single k below to hit the target RTP. */
const WEIGHT: Record<Pattern, number> = {
  five: 200,
  four: 30,
  fullHouse: 12,
  three: 4,
  twoPair: 2,
  pair: 1,
  none: 0,
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** The EXACT probability of each pattern. Sums to 1 by construction. */
export function patternProbabilities(): Record<Pattern, number> {
  const out = {} as Record<Pattern, number>
  for (const p of PATTERNS) out[p] = PATTERN_COUNTS[p] / DENOM
  return out
}

/**
 * The multiplier for each pattern under a house config: rarer patterns pay more,
 * 'none' pays 0×, and Σ P(pattern)·mult(pattern) = (1 − edge). Start from the
 * weighted tiers, drop the lowest-paying tier until the rest fit, then scale UP
 * to hit the target — so every paying tier stays above 1× (Keno's loop).
 */
export function buildPaytable(
  config: DiamondsHouseConfig = DEFAULT_DIAMONDS_CONFIG,
): Record<Pattern, number> {
  const probs = patternProbabilities()
  const target = 1 - config.edge
  // Paying patterns, ordered commonest → rarest, so we drop the LOWEST-paying
  // (commonest, smallest-weight) first while it underpays.
  const paying: Pattern[] = ['pair', 'twoPair', 'three', 'fullHouse', 'four', 'five']

  let start = 0 // index into `paying` of the lowest tier still paying
  for (;;) {
    let denom = 0
    for (let i = start; i < paying.length; i++) denom += probs[paying[i]] * WEIGHT[paying[i]]
    const k = target / denom

    const table = {} as Record<Pattern, number>
    for (const p of PATTERNS) table[p] = 0
    for (let i = start; i < paying.length; i++) table[paying[i]] = k * WEIGHT[paying[i]]

    // The lowest paying tier is the commonest one still in — `paying[start]`.
    if (table[paying[start]] >= MIN_PAY || start === paying.length - 1) {
      for (const p of PATTERNS) table[p] = table[p] > 0 ? round2(table[p]) : 0
      return table
    }
    start++ // lowest tier paid too little — drop it and re-scale
  }
}

/** The realized RTP of the (rounded) paytable — Σ P(pattern)·mult(pattern). */
export function rtpOf(config: DiamondsHouseConfig = DEFAULT_DIAMONDS_CONFIG): number {
  const probs = patternProbabilities()
  const table = buildPaytable(config)
  let rtp = 0
  for (const p of PATTERNS) rtp += probs[p] * table[p]
  return rtp
}

/** Classify a 5-gem deal into its count pattern (the multiset of colour counts). */
export function classify(gems: number[]): Pattern {
  const counts = new Map<number, number>()
  for (const g of gems) counts.set(g, (counts.get(g) ?? 0) + 1)
  const sorted = [...counts.values()].sort((a, b) => b - a) // descending
  const key = sorted.join(',')
  switch (key) {
    case '5':
      return 'five'
    case '4,1':
      return 'four'
    case '3,2':
      return 'fullHouse'
    case '3,1,1':
      return 'three'
    case '2,2,1':
      return 'twoPair'
    case '2,1,1,1':
      return 'pair'
    default:
      return 'none'
  }
}
