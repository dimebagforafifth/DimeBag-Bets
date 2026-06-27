/**
 * Three Card Poker module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const threeCardPokerMeta = {
  key: 'threecardpoker',
  supportsAdjustableEdge: false,
  name: 'Three Card Poker',
  tagline: 'Beat the dealer with three cards.',
  accent: '#f0be4a',
} as const

export { RANKS, SUITS, DECK, dealtDeck, deal3, verify, hashServerSeed } from './fair.js'
export type { Card, Deal } from './fair.js'

export {
  RANK_ORDER,
  RANK_LABELS,
  ANTE_BONUS,
  ANTE_BONUS_ROWS,
  PAIR_PLUS,
  PAIR_PLUS_ROWS,
  evaluate3,
  compareHands,
  anteBonusOdds,
  pairPlusReturn,
  dealerQualifies,
} from './payouts.js'
export type { Rank, HandValue } from './payouts.js'

export {
  randomServerSeed,
  createGame,
  play,
  fold,
  totalStaked,
  totalReturned,
  totalProfit,
  revealProof,
} from './engine.js'
export type {
  ThreeCardGame,
  ThreeCardStatus,
  Decision,
  BetOutcome,
  CreateGameOptions,
  FairProof,
} from './engine.js'
