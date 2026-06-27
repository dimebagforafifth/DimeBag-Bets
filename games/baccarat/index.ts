/**
 * Baccarat module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const baccaratMeta = {
  key: 'baccarat',
  supportsAdjustableEdge: false,
  name: 'Baccarat',
  tagline: 'Player or Banker — closest to nine.',
  accent: '#f0be4a',
} as const

export {
  RANKS,
  SUITS,
  DECKS,
  SHOE_SIZE,
  cardValue,
  handTotal,
  bankerDraws,
  dealBaccarat,
  verifyBaccarat,
  hashServerSeed,
} from './fair.js'
export type { BaccaratCard, BaccaratDeal, BaccaratWinner } from './fair.js'

export {
  PAYOUTS,
  ODDS_LABEL,
  BET_ORDER,
  spotOutcome,
  randomServerSeed,
  playBaccarat,
} from './engine.js'
export type {
  BaccaratBet,
  BaccaratRound,
  BetResult,
  BetOutcome,
  Bets,
  PlayBaccaratOptions,
} from './engine.js'
