/**
 * Video Poker (Jacks or Better, 9/6) hand evaluator + paytable (CLAUDE.md §4, §7).
 *
 * Video Poker odds are industry-standard, so we use the canonical 9/6 Jacks or
 * Better schedule rather than computing to a target edge: under OPTIMAL play it
 * returns ~99.54% (a ~0.46% house edge) — but it is a SKILL game, the realized
 * RTP depends entirely on which cards you hold, so there is no single fixed edge
 * to fit. The "9/6" names the full-house (9) and flush (6) "to 1" payouts.
 *
 * In this codebase a "1 to 1" win means a RETURN multiplier of 2 (the stake comes
 * back plus an equal win). So the standard "to 1" schedule below is expressed as
 * RETURN multipliers (total returned per stake = winnings + stake):
 *
 *   to-1   return        category
 *   ----   ------        --------
 *    800     801*        royal flush  (*non-progressive 9/6 pays 800-to-1 → 801×;
 *                                       see note below — we use the conventional 800/250)
 *    50       51         straight flush
 *    25       26         four of a kind
 *     9       10         full house
 *     6        7         flush
 *     4        5         straight
 *     3        4         three of a kind
 *     2        3         two pair
 *     1        2         jacks or better (a pair of J, Q, K or A)
 *   anything worse → 0 (loss).
 *
 * NOTE: the spec fixes the royal flush RETURN at 251 (the classic 5-coin 4000-coin
 * / 250-to-1 single-line payout) and straight flush at 51, so we use those.
 */

import type { Card } from './fair.js'

/** Distinct paying categories, best → worst. */
export type HandRank =
  | 'royal-flush'
  | 'straight-flush'
  | 'four-of-a-kind'
  | 'full-house'
  | 'flush'
  | 'straight'
  | 'three-of-a-kind'
  | 'two-pair'
  | 'jacks-or-better'
  | 'nothing'

export interface HandResult {
  rank: HandRank
  /** RETURN multiplier (stake × this is paid back). 0 = a loss. */
  multiplier: number
}

/** Human-readable label for a rank (UI paytable rows + results). */
export const RANK_LABELS: Record<HandRank, string> = {
  'royal-flush': 'Royal Flush',
  'straight-flush': 'Straight Flush',
  'four-of-a-kind': 'Four of a Kind',
  'full-house': 'Full House',
  flush: 'Flush',
  straight: 'Straight',
  'three-of-a-kind': 'Three of a Kind',
  'two-pair': 'Two Pair',
  'jacks-or-better': 'Jacks or Better',
  nothing: 'No Win',
}

/** RETURN multiplier per category (9/6 schedule, see file header). 0 = loss. */
export const PAYTABLE: Record<HandRank, number> = {
  'royal-flush': 251,
  'straight-flush': 51,
  'four-of-a-kind': 26,
  'full-house': 10,
  flush: 7,
  straight: 5,
  'three-of-a-kind': 4,
  'two-pair': 3,
  'jacks-or-better': 2,
  nothing: 0,
}

/** Paying rows, best → worst, for rendering the paytable in the UI. */
export const PAYTABLE_ROWS: { rank: HandRank; label: string; multiplier: number }[] = (
  [
    'royal-flush',
    'straight-flush',
    'four-of-a-kind',
    'full-house',
    'flush',
    'straight',
    'three-of-a-kind',
    'two-pair',
    'jacks-or-better',
  ] as HandRank[]
).map((rank) => ({ rank, label: RANK_LABELS[rank], multiplier: PAYTABLE[rank] }))

/** True if the five distinct ranks form a run (incl. the A-2-3-4-5 wheel). */
function isStraight(sortedRanks: number[]): boolean {
  // sortedRanks is 5 DISTINCT ranks ascending, with Ace counted as 14 (high).
  if (sortedRanks.length !== 5) return false
  // Normal run: each step +1.
  let run = true
  for (let i = 1; i < 5; i++) if (sortedRanks[i] !== sortedRanks[i - 1] + 1) run = false
  if (run) return true
  // Wheel A-2-3-4-5: with Ace high this is [2,3,4,5,14].
  return (
    sortedRanks[0] === 2 &&
    sortedRanks[1] === 3 &&
    sortedRanks[2] === 4 &&
    sortedRanks[3] === 5 &&
    sortedRanks[4] === 14
  )
}

/**
 * Evaluate a 5-card hand → its category + RETURN multiplier. Ace is high (14) for
 * straights/flushes and also forms the A-2-3-4-5 wheel; a "royal flush" is the
 * 10-J-Q-K-A straight flush. A pair only pays at jacks-or-better (J/Q/K/A).
 */
export function evaluateHand(cards5: Card[]): HandResult {
  if (cards5.length !== 5) throw new Error(`evaluateHand needs exactly 5 cards, got ${cards5.length}`)

  // Ace high for ranking; keep originals for nothing-else logic.
  const highRanks = cards5.map((c) => (c.rank === 1 ? 14 : c.rank))
  const flush = cards5.every((c) => c.suit === cards5[0].suit)

  // Count how many of each high-rank.
  const counts = new Map<number, number>()
  for (const r of highRanks) counts.set(r, (counts.get(r) ?? 0) + 1)
  const distinct = [...counts.keys()].sort((a, b) => a - b)
  const countVals = [...counts.values()].sort((a, b) => b - a) // e.g. [3,2] = full house

  const straight = distinct.length === 5 && isStraight(distinct)

  // Royal = straight flush whose high card is the Ace (10-J-Q-K-A).
  if (straight && flush) {
    const isRoyal = distinct[0] === 10 && distinct[4] === 14
    return isRoyal ? pack('royal-flush') : pack('straight-flush')
  }
  if (countVals[0] === 4) return pack('four-of-a-kind')
  if (countVals[0] === 3 && countVals[1] === 2) return pack('full-house')
  if (flush) return pack('flush')
  if (straight) return pack('straight')
  if (countVals[0] === 3) return pack('three-of-a-kind')
  if (countVals[0] === 2 && countVals[1] === 2) return pack('two-pair')
  if (countVals[0] === 2) {
    // The single pair only pays if it is J(11)/Q(12)/K(13)/A(14).
    const pairRank = distinct.find((r) => counts.get(r) === 2)!
    if (pairRank >= 11 || pairRank === 14) return pack('jacks-or-better')
  }
  return pack('nothing')
}

function pack(rank: HandRank): HandResult {
  return { rank, multiplier: PAYTABLE[rank] }
}
