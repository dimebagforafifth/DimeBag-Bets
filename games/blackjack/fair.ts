/**
 * Blackjack provably-fair shuffle (CLAUDE.md §6, §7). The shared HMAC float
 * stream (core/fair) is turned into a full deck permutation by a Fisher-Yates
 * pick-and-remove — the same technique Mines uses for mine placement, so the
 * crypto stays in one place.
 *
 * The whole shoe order is fixed at deal time (server seed committed as a hash
 * beforehand) and is never influenced by how the player hits or stands, so the
 * player can recompute the exact deck afterward and confirm nothing moved.
 */

import { floatStream } from '../../core/fair.js'
import { freshDeck, type Card } from './cards.js'
export { hashServerSeed } from '../../core/fair.js'

/**
 * Derive the shuffled deck (all 52 cards, in deal order) for a round.
 * Deterministic in (serverSeed, clientSeed, nonce): the heart of provable
 * fairness. Cards are drawn from the front of this array as the round plays.
 */
export function shuffleDeck(serverSeed: string, clientSeed: string, nonce: number): Card[] {
  const pool = freshDeck()
  const out: Card[] = []
  const floats = floatStream(serverSeed, clientSeed, nonce)
  while (pool.length > 0) {
    const index = Math.floor(floats.next().value * pool.length)
    out.push(pool.splice(index, 1)[0])
  }
  return out
}

/** Re-derive the deck from revealed seeds to verify a finished round. */
export function verifyShoe(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  expected: Card[],
): boolean {
  const derived = shuffleDeck(serverSeed, clientSeed, nonce)
  return (
    derived.length === expected.length &&
    derived.every((c, i) => c.rank === expected[i].rank && c.suit === expected[i].suit)
  )
}
