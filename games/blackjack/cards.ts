/**
 * Blackjack card model (CLAUDE.md §7) — a standard 52-card deck and the hand
 * arithmetic. Pure and side-effect-free: the engine owns dealing/settlement, the
 * fair module owns the shuffle, this just defines cards and how a hand totals.
 */

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  rank: Rank
  suit: Suit
}

export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

/** The 52 cards in a fixed canonical order (suit-major). The shuffle permutes
 *  this; keeping the order fixed is what makes a shuffle reproducible. */
export function freshDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit })
  return deck
}

/** A card's base value: aces count 11 here (softened later), faces 10. */
export function cardValue(rank: Rank): number {
  if (rank === 'A') return 11
  if (rank === 'K' || rank === 'Q' || rank === 'J') return 10
  return Number(rank)
}

export interface HandValue {
  /** Best total ≤ 21 if possible (aces reduced from 11 to 1 as needed). */
  total: number
  /** True if an ace is still counting as 11 (a "soft" hand). */
  soft: boolean
}

/** Total a hand, reducing aces from 11 → 1 while it would otherwise bust. */
export function handValue(cards: Card[]): HandValue {
  let total = 0
  let aces = 0
  for (const c of cards) {
    total += cardValue(c.rank)
    if (c.rank === 'A') aces += 1
  }
  // Each ace can drop 10 (11 → 1) to dodge a bust.
  while (total > 21 && aces > 0) {
    total -= 10
    aces -= 1
  }
  return { total, soft: aces > 0 }
}

/** A two-card 21 — a natural blackjack. */
export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21
}

/** Whether a hand has gone over 21. */
export function isBust(cards: Card[]): boolean {
  return handValue(cards).total > 21
}

/** Short label for a card, e.g. "A♠" — handy for logs/tests. */
export function cardLabel(card: Card): string {
  const glyph = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }[card.suit]
  return `${card.rank}${glyph}`
}
