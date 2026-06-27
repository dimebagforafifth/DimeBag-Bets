/**
 * Plinko module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const plinkoMeta = {
  key: 'plinko',
  supportsAdjustableEdge: true,
  name: 'Plinko',
  tagline: 'Drop the ball — ride it down the pegs.',
  accent: '#f0be4a',
} as const

export {
  MIN_ROWS,
  MAX_ROWS,
  RISKS,
  payouts,
  computePlinkoTable,
  BASE_RTP,
  slotProbabilities,
  rtpOf,
  DEFAULT_PLINKO_CONFIG,
} from './payouts.js'
export type { PlinkoRisk, PlinkoHouseConfig } from './payouts.js'

export { dropBall, verifyDrop, hashServerSeed } from './fair.js'
export type { PlinkoDrop } from './fair.js'

export type { PlinkoRound, PlayPlinkoOptions } from './engine.js'
export { randomServerSeed, playPlinko } from './engine.js'
