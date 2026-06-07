/**
 * Baccarat provably-fair deal (CLAUDE.md §6) — a real 8-DECK shoe (416 cards),
 * shuffled with a seeded Fisher–Yates straight off the shared float stream, then
 * dealt under the standard punto-banco tableau.
 *
 * Using a true 8-deck shoe (rather than drawing ranks with replacement) is what
 * makes this industry-grade: pairs are real, card depletion is real, and the
 * house edges land on the published 8-deck figures (Banker ≈ 1.06%, Player ≈
 * 1.24%, Tie ≈ 14.4%, each Pair ≈ 10.36% at 11:1). The whole round is decided
 * ONLY by (serverSeed, clientSeed, nonce) — a fresh shoe is shuffled per round —
 * so it is fully verifiable once the server seed is revealed.
 */

import { floatStream, hashServerSeed } from '../../core/fair.js'

export { hashServerSeed }

export const RANKS = 13
export const SUITS = 4
export const DECKS = 8
export const SHOE_SIZE = DECKS * RANKS * SUITS // 416

export type BaccaratWinner = 'player' | 'banker' | 'tie'

export interface BaccaratCard {
  /** 1 = Ace … 13 = King. */
  rank: number
  /** 0..3 — ♠♥♦♣ (cosmetic; baccarat is played on rank value alone). */
  suit: number
}

export interface BaccaratDeal {
  player: BaccaratCard[]
  banker: BaccaratCard[]
  playerTotal: number
  bankerTotal: number
  winner: BaccaratWinner
  /** The hand's first two cards share a rank — the Player/Banker Pair side bet. */
  playerPair: boolean
  bankerPair: boolean
}

/** Baccarat point value of a rank: A=1, 2-9 = face, 10/J/Q/K = 0. */
export function cardValue(rank: number): number {
  return rank >= 10 ? 0 : rank
}

/** A hand total is the sum of card values mod 10. */
export function handTotal(cards: BaccaratCard[]): number {
  return cards.reduce((sum, c) => sum + cardValue(c.rank), 0) % 10
}

/** The ordered 8-deck shoe, before shuffling (8 × 52 distinct cards). */
function freshShoe(): BaccaratCard[] {
  const shoe: BaccaratCard[] = []
  for (let d = 0; d < DECKS; d++) {
    for (let rank = 1; rank <= RANKS; rank++) {
      for (let suit = 0; suit < SUITS; suit++) shoe.push({ rank, suit })
    }
  }
  return shoe
}

/** Seeded Fisher–Yates shuffle — one float per swap, so the order is reproducible
 *  from (serverSeed, clientSeed, nonce). */
function shuffle(shoe: BaccaratCard[], gen: Generator<number>): void {
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor((gen.next().value as number) * (i + 1)))
    const tmp = shoe[i]
    shoe[i] = shoe[j]
    shoe[j] = tmp
  }
}

/**
 * Whether the Banker draws a third card, per the standard tableau. `bankerTotal`
 * is the Banker's two-card total; `playerThird` is the value (0..9) of the
 * Player's third card, or null if the Player stood on two cards.
 */
export function bankerDraws(bankerTotal: number, playerThird: number | null): boolean {
  if (playerThird === null) {
    // Player stood: Banker draws on 0-5, stands on 6-7 (naturals already handled).
    return bankerTotal <= 5
  }
  const t = playerThird
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true
    case 3:
      return t !== 8
    case 4:
      return t >= 2 && t <= 7
    case 5:
      return t >= 4 && t <= 7
    case 6:
      return t >= 6 && t <= 7
    default:
      return false // 7 stands (8/9 are naturals, handled earlier)
  }
}

/**
 * Deal a full Baccarat round: shuffle a fresh 8-deck shoe from the seeds, then
 * deal off the top — Player1, Banker1, Player2, Banker2, then any third cards
 * (Player's before Banker's) per the tableau.
 */
export function dealBaccarat(serverSeed: string, clientSeed: string, nonce: number): BaccaratDeal {
  const gen = floatStream(serverSeed, clientSeed, nonce)
  const shoe = freshShoe()
  shuffle(shoe, gen)
  let idx = 0
  const draw = (): BaccaratCard => shoe[idx++]

  const player: BaccaratCard[] = []
  const banker: BaccaratCard[] = []

  // Deal order: P1, B1, P2, B2.
  player.push(draw())
  banker.push(draw())
  player.push(draw())
  banker.push(draw())

  // A pair = the first two cards share a rank (K-K counts, even though both are 0).
  const playerPair = player[0].rank === player[1].rank
  const bankerPair = banker[0].rank === banker[1].rank

  let pTotal = handTotal(player)
  let bTotal = handTotal(banker)

  // Naturals: an 8 or 9 from the first two cards stands both hands.
  const natural = pTotal >= 8 || bTotal >= 8
  if (!natural) {
    let playerThird: number | null = null
    // Player draws a third card on 0-5, stands on 6-7.
    if (pTotal <= 5) {
      const card = draw()
      player.push(card)
      playerThird = cardValue(card.rank)
      pTotal = handTotal(player)
    }
    // Banker third card per the standard table.
    if (bankerDraws(bTotal, playerThird)) {
      banker.push(draw())
      bTotal = handTotal(banker)
    }
  }

  const winner: BaccaratWinner = pTotal > bTotal ? 'player' : bTotal > pTotal ? 'banker' : 'tie'
  return {
    player,
    banker,
    playerTotal: pTotal,
    bankerTotal: bTotal,
    winner,
    playerPair,
    bankerPair,
  }
}

/** Re-derive the deal from revealed seeds to verify a round. */
export function verifyBaccarat(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  expected: BaccaratDeal,
): boolean {
  const got = dealBaccarat(serverSeed, clientSeed, nonce)
  return (
    got.winner === expected.winner &&
    got.playerTotal === expected.playerTotal &&
    got.bankerTotal === expected.bankerTotal &&
    got.playerPair === expected.playerPair &&
    got.bankerPair === expected.bankerPair &&
    got.player.length === expected.player.length &&
    got.banker.length === expected.banker.length &&
    got.player.every((c, i) => c.rank === expected.player[i].rank && c.suit === expected.player[i].suit) &&
    got.banker.every((c, i) => c.rank === expected.banker[i].rank && c.suit === expected.banker[i].suit)
  )
}
