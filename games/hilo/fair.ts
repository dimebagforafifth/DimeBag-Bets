/**
 * HiLo provably-fair card draws (CLAUDE.md §7). Cards are drawn independently
 * from a standard 52-card deck off the shared float stream (same primitive as
 * Mines/Keno): a float in [0,1) maps to one of 52 cards. `rank` is an order index
 * 1 (a 2, low) … 13 (an Ace, high) — Ace-high, like Stake — and suits are
 * cosmetic. Independent (with-replacement) draws let a streak run indefinitely,
 * matching Stake. Deterministic in the seeds — fully verifiable.
 */

import { floatStream, hashServerSeed } from '../../core/fair.js'

export { hashServerSeed }

export const RANKS = 13
export const SUITS = 4
export const DECK = RANKS * SUITS // 52

export interface Card {
  /** Order index: 1 = a 2 (low) … 13 = an Ace (high). Ace-high, like Stake. */
  rank: number
  /** 0..3 — cosmetic (♠♥♦♣). */
  suit: number
}

function cardFromFloat(f: number): Card {
  const idx = Math.min(DECK - 1, Math.floor(f * DECK))
  return { rank: Math.floor(idx / SUITS) + 1, suit: idx % SUITS }
}

/** The card at sequence position `index` (0 = the round's first card). */
export function cardAt(serverSeed: string, clientSeed: string, nonce: number, index: number): Card {
  const gen = floatStream(serverSeed, clientSeed, nonce)
  let f = 0
  for (let i = 0; i <= index; i++) f = gen.next().value as number
  return cardFromFloat(f)
}

/** The first `count` cards of the round, in order. */
export function cardsUpTo(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  count: number,
): Card[] {
  const gen = floatStream(serverSeed, clientSeed, nonce)
  const out: Card[] = []
  for (let i = 0; i < count; i++) out.push(cardFromFloat(gen.next().value as number))
  return out
}

/** Re-derive a round's card sequence from revealed seeds to verify it. */
export function verifyHilo(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cards: Card[],
): boolean {
  const want = cardsUpTo(serverSeed, clientSeed, nonce, cards.length)
  return cards.every((c, i) => c.rank === want[i].rank && c.suit === want[i].suit)
}
