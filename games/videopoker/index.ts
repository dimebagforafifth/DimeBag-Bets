/**
 * Video Poker module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const videoPokerMeta = {
  key: 'videopoker',
  supportsAdjustableEdge: false,
  name: 'Video Poker',
  tagline: 'Jacks or Better — hold and draw to the best hand.',
  accent: '#f0be4a',
} as const

export { RANKS, SUITS, DECK, dealtDeck, verifyDeck, hashServerSeed } from './fair.js'
export type { Card } from './fair.js'

export { PAYTABLE, PAYTABLE_ROWS, RANK_LABELS, evaluateHand } from './payouts.js'
export type { HandRank, HandResult } from './payouts.js'

export { randomServerSeed, createVideoPoker, draw, revealProof } from './engine.js'
export type {
  VideoPokerGame,
  VideoPokerStatus,
  CreateVideoPokerOptions,
  FairProof,
} from './engine.js'
