/**
 * Coin Flip module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const coinFlipMeta = {
  key: 'coinflip',
  supportsAdjustableEdge: true,
  name: 'Coin Flip',
  tagline: 'Call it in the air — ride the streak.',
  accent: '#f0be4a',
} as const

export { coinAt, coinsUpTo, verifyCoinFlips, hashServerSeed } from './fair.js'
export type { CoinFace } from './fair.js'

export {
  COIN_WIN_PROB,
  DEFAULT_COINFLIP_CONFIG,
  randomServerSeed,
  stepMultiplier,
  rtpOf,
  createCoinFlip,
  flip,
  cashOut,
  revealProof,
} from './engine.js'
export type {
  CoinFlipHouseConfig,
  CoinFlipStatus,
  CoinFlipGame,
  CreateCoinFlipOptions,
  FlipResult,
  FairProof,
} from './engine.js'
