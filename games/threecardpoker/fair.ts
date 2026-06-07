/**
 * Three Card Poker provably-fair deck (CLAUDE.md §6). The whole round is decided
 * up front: a full 52-card deck is shuffled deterministically from the seed via a
 * Fisher-Yates pass over the shared float stream (identical to Video Poker's
 * shuffle). The first 3 cards are the PLAYER's hand, the next 3 the DEALER's — so
 * the player's later Play/Fold choice never changes which cards were dealt,
 * exactly like real provably-fair Three Card Poker. Deterministic in the seeds →
 * fully verifiable.
 *
 * Cards: rank 1..13 with Ace = 1 (treated as high = 14 in the evaluator, and also
 * the low end of the A-2-3 wheel straight); suit 0..3 (♠♥♦♣).
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

export interface Deal {
  /** The player's 3 cards (deck positions 0..2). */
  player: Card[]
  /** The dealer's 3 cards (deck positions 3..5). */
  dealer: Card[]
}

/**
 * Deal both hands for a round: the first 3 shuffled cards to the player, the next
 * 3 to the dealer. Predetermined by the seeds — Play/Fold never changes them.
 */
export function deal3(serverSeed: string, clientSeed: string, nonce: number): Deal {
  const deck = dealtDeck(serverSeed, clientSeed, nonce)
  return { player: deck.slice(0, 3), dealer: deck.slice(3, 6) }
}

/** Re-derive the deal from revealed seeds to verify a round's two hands. */
export function verify(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  deal: Deal,
): boolean {
  const want = deal3(serverSeed, clientSeed, nonce)
  const same = (a: Card[], b: Card[]) =>
    a.length === b.length && a.every((c, i) => c.rank === b[i].rank && c.suit === b[i].suit)
  return same(deal.player, want.player) && same(deal.dealer, want.dealer)
}
