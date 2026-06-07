/**
 * Three Card Poker hand evaluator + payout schedules (CLAUDE.md §4, §7).
 *
 * Three Card Poker odds are INDUSTRY-STANDARD, so we use the canonical published
 * paytables rather than computing to a target edge. The inherent house edge of
 * the standard schedules below is:
 *   - Ante + Play (with the standard 1-4-5 Ante Bonus): ≈ 3.37% on the ante, or
 *     ≈ 2.01% per total amount wagered (ante + play) under optimal Q-6-4 strategy.
 *   - Pair Plus (the 1-3-6-30-40 schedule used here): ≈ 7.28% house edge.
 * These are stated here per §4; the engine test back-checks the Pair Plus realized
 * RTP over the full 22,100-combination deal space.
 *
 * 3-CARD HAND RANKING — note the order differs from 5-card poker: a STRAIGHT beats
 * a FLUSH because with three cards a straight is the rarer hand. Best → worst:
 *   Straight Flush > Three of a Kind > Straight > Flush > Pair > High Card.
 * Ace is high (14); the A-2-3 wheel and Q-K-A both count as straights.
 */

import type { Card } from './fair.js'

/** Distinct 3-card hand categories, best → worst. */
export type Rank =
  | 'straight-flush'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'pair'
  | 'high-card'

/** Numeric strength of each rank for comparison (higher = better). */
export const RANK_ORDER: Record<Rank, number> = {
  'straight-flush': 5,
  'three-of-a-kind': 4,
  straight: 3,
  flush: 2,
  pair: 1,
  'high-card': 0,
}

/** Human-readable label for a rank (UI paytable rows + results). */
export const RANK_LABELS: Record<Rank, string> = {
  'straight-flush': 'Straight Flush',
  'three-of-a-kind': 'Three of a Kind',
  straight: 'Straight',
  flush: 'Flush',
  pair: 'Pair',
  'high-card': 'High Card',
}

export interface HandValue {
  rank: Rank
  /**
   * Tiebreak vector for comparing two hands of the SAME rank, most-significant
   * first (e.g. for a pair: [pairRank, kicker]; for high card: the three ranks
   * descending). Compared lexicographically.
   */
  tiebreak: number[]
}

/** True for a 3-card straight given DISTINCT high-ace ranks ascending. Handles
 *  the A-2-3 wheel ([2,3,14]) and the normal Q-K-A ([12,13,14]). */
function isThreeStraight(sorted: number[]): boolean {
  if (sorted.length !== 3) return false
  // Wheel A-2-3: with Ace high this is [2,3,14].
  if (sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 14) return true
  return sorted[1] === sorted[0] + 1 && sorted[2] === sorted[1] + 1
}

/**
 * Evaluate a 3-card hand → its category + a tiebreak vector. Ace is high (14) but
 * also forms the A-2-3 wheel straight (where it is the LOW card, so the straight's
 * high card is the 3). Returns `{ rank, tiebreak }` so two same-rank hands can be
 * ordered with `compareHands`.
 */
export function evaluate3(cards: Card[]): HandValue {
  if (cards.length !== 3) throw new Error(`evaluate3 needs exactly 3 cards, got ${cards.length}`)

  const highRanks = cards.map((c) => (c.rank === 1 ? 14 : c.rank))
  const desc = [...highRanks].sort((a, b) => b - a) // descending, for kickers
  const asc = [...highRanks].sort((a, b) => a - b)
  const flush = cards.every((c) => c.suit === cards[0].suit)

  const counts = new Map<number, number>()
  for (const r of highRanks) counts.set(r, (counts.get(r) ?? 0) + 1)
  const distinct = [...counts.keys()].sort((a, b) => a - b)
  const countVals = [...counts.values()].sort((a, b) => b - a) // e.g. [3] trips, [2,1] pair

  const straight = distinct.length === 3 && isThreeStraight(asc)
  // For the A-2-3 wheel the straight's HIGH card is the 3, not the ace.
  const isWheel = straight && asc[0] === 2 && asc[1] === 3 && asc[2] === 14
  const straightHigh = isWheel ? 3 : desc[0]

  if (straight && flush) return { rank: 'straight-flush', tiebreak: [straightHigh] }
  if (countVals[0] === 3) return { rank: 'three-of-a-kind', tiebreak: [desc[0]] }
  if (straight) return { rank: 'straight', tiebreak: [straightHigh] }
  if (flush) return { rank: 'flush', tiebreak: desc }
  if (countVals[0] === 2) {
    const pairRank = distinct.find((r) => counts.get(r) === 2)!
    const kicker = distinct.find((r) => counts.get(r) === 1)!
    return { rank: 'pair', tiebreak: [pairRank, kicker] }
  }
  return { rank: 'high-card', tiebreak: desc }
}

/**
 * Compare two evaluated hands: > 0 if `a` beats `b`, < 0 if `b` beats `a`, 0 on a
 * tie. First by rank strength, then lexicographically by the tiebreak vector.
 */
export function compareHands(a: HandValue, b: HandValue): number {
  const ra = RANK_ORDER[a.rank]
  const rb = RANK_ORDER[b.rank]
  if (ra !== rb) return ra - rb
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const da = a.tiebreak[i] ?? 0
    const db = b.tiebreak[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

/**
 * ANTE BONUS — paid on top of the ante's base return, regardless of whether the
 * dealer qualifies, but ONLY when the player Plays (a fold forfeits the ante and
 * its bonus). Standard 1-4-5 schedule, expressed as "to 1" odds ADDED to the base
 * return multiplier:
 *   Straight 1:1, Three of a Kind 4:1, Straight Flush 5:1.
 * Any other hand pays no ante bonus.
 */
export const ANTE_BONUS: Partial<Record<Rank, number>> = {
  straight: 1,
  'three-of-a-kind': 4,
  'straight-flush': 5,
}

/** The ante bonus "to 1" odds for a hand, or 0 if it earns none. */
export function anteBonusOdds(value: HandValue): number {
  return ANTE_BONUS[value.rank] ?? 0
}

/** Ante bonus rows for the UI paytable (best → worst). */
export const ANTE_BONUS_ROWS: { rank: Rank; label: string; odds: number }[] = (
  ['straight-flush', 'three-of-a-kind', 'straight'] as Rank[]
).map((rank) => ({ rank, label: RANK_LABELS[rank], odds: ANTE_BONUS[rank]! }))

/**
 * PAIR PLUS — an independent side bet on the player's three cards alone, settled
 * at the deal regardless of Play/Fold. Standard 1-3-6-30-40 schedule, expressed as
 * the RETURN multiplier (stake × this is paid back; 0 = a loss):
 *   Pair 2× (1:1), Flush 4× (3:1), Straight 7× (6:1),
 *   Three of a Kind 31× (30:1), Straight Flush 41× (40:1).
 * Worse than a pair → 0× (loss). Inherent edge ≈ 7.28% (back-checked in tests).
 */
export const PAIR_PLUS: Record<Rank, number> = {
  'straight-flush': 41,
  'three-of-a-kind': 31,
  straight: 7,
  flush: 4,
  pair: 2,
  'high-card': 0,
}

/** The Pair Plus RETURN multiplier for the player's hand (0 = loss). */
export function pairPlusReturn(value: HandValue): number {
  return PAIR_PLUS[value.rank]
}

/** Pair Plus paying rows for the UI paytable (best → worst). */
export const PAIR_PLUS_ROWS: { rank: Rank; label: string; multiplier: number }[] = (
  ['straight-flush', 'three-of-a-kind', 'straight', 'flush', 'pair'] as Rank[]
).map((rank) => ({ rank, label: RANK_LABELS[rank], multiplier: PAIR_PLUS[rank] }))

/** The dealer QUALIFIES with Queen-high or better — i.e. a hand ranked above a
 *  high card, OR a high card whose top card is at least a Queen (12). */
export function dealerQualifies(value: HandValue): boolean {
  if (value.rank !== 'high-card') return true
  return value.tiebreak[0] >= 12
}
