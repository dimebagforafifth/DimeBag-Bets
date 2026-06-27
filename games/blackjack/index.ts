/**
 * Blackjack module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const blackjackMeta = {
  key: 'blackjack',
  supportsAdjustableEdge: false,
  name: 'Blackjack',
  tagline: 'Beat the dealer to 21.',
  accent: '#f0be4a',
} as const

export {
  SUITS,
  RANKS,
  freshDeck,
  cardValue,
  handValue,
  isBlackjack,
  isBust,
  cardLabel,
} from './cards.js'
export type { Card, Suit, Rank, HandValue } from './cards.js'

export { shuffleDeck, verifyShoe, hashServerSeed } from './fair.js'

export type {
  BlackjackGame,
  BlackjackStatus,
  BlackjackResult,
  CreateBlackjackOptions,
  Hand,
} from './engine.js'
export {
  randomServerSeed,
  createBlackjackGame,
  hit,
  stand,
  double,
  split,
  canDouble,
  canSplit,
  offersInsurance,
  insuranceBet,
  takeInsurance,
  declineInsurance,
  totalReturned,
  totalWagered,
} from './engine.js'
