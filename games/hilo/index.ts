/**
 * HiLo module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const hiloMeta = {
  key: 'hilo',
  supportsAdjustableEdge: true,
  name: 'HiLo',
  tagline: 'Higher or lower — ride the streak.',
  accent: '#f0be4a',
} as const

export { RANKS, SUITS, DECK, cardAt, cardsUpTo, verifyHilo, hashServerSeed } from './fair.js'
export type { Card } from './fair.js'

export {
  DEFAULT_HILO_CONFIG,
  randomServerSeed,
  probHigher,
  probLower,
  stepMultiplier,
  currentCard,
  createHiloGame,
  guess,
  skip,
  cashOut,
  revealProof,
} from './engine.js'
export type {
  HiloHouseConfig,
  HiloStatus,
  HiloGuess,
  HiloGame,
  CreateHiloOptions,
  GuessResult,
  FairProof,
} from './engine.js'
