/**
 * Video Poker provably-fair deck (CLAUDE.md §6). The whole round is decided up
 * front: a full 52-card deck is shuffled deterministically from the seed via a
 * Fisher-Yates pass over the shared float stream. The first 5 cards are the deal;
 * draw replacements come from positions 5, 6, 7, … in that fixed order — so your
 * HOLD choices only pick WHICH of the predetermined draws you take, exactly like
 * real provably-fair video poker. Deterministic in the seeds → fully verifiable.
 *
 * Cards: rank 1..13 with Ace = 1 (treated as both high = 14 for straights AND the
 * A-2-3-4-5 wheel low in the evaluator); suit 0..3 (♠♥♦♣).
 */

import { floatStream, hashServerSeed } from '../../core/fair.js'

export { hashServerSeed }

export const RANKS = 13
export const SUITS = 4
export const DECK = RANKS * SUITS // 52

export interface Card {
  /** 1 = Ace … 13 = King. Ace counts high (14) and low in the evaluator. */
  rank: number
  /** 0..3 — cosmetic (♠♥♦♣). */
  suit: number
}

/** The card occupying deck index 0..51 (rank-major, suit-minor ordering). */
function cardFromIndex(idx: number): Card {
  return { rank: Math.floor(idx / SUITS) + 1, suit: idx % SUITS }
}

/**
 * The full shuffled 52-card deck for a round. Fisher-Yates over the float stream:
 * walk i from 51 down to 1, swap with j = floor(f × (i+1)). One float per step,
 * drawn in order off the shared stream — so the order is fixed by the seeds.
 */
export function dealtDeck(serverSeed: string, clientSeed: string, nonce: number): Card[] {
  const order = Array.from({ length: DECK }, (_, i) => i)
  const gen = floatStream(serverSeed, clientSeed, nonce)
  for (let i = DECK - 1; i >= 1; i--) {
    const f = gen.next().value as number
    const j = Math.min(i, Math.floor(f * (i + 1)))
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  return order.map(cardFromIndex)
}

/** Re-derive the deck from revealed seeds to verify a round's card order. */
export function verifyDeck(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  deck: Card[],
): boolean {
  const want = dealtDeck(serverSeed, clientSeed, nonce)
  return (
    deck.length === want.length &&
    deck.every((c, i) => c.rank === want[i].rank && c.suit === want[i].suit)
  )
}
