/**
 * Plinko module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const plinkoMeta = {
  key: 'plinko',
  name: 'Plinko',
  tagline: 'Drop the ball — ride it down the pegs.',
  accent: '#ff4d6d',
} as const

export {
  MIN_ROWS,
  MAX_ROWS,
  RISKS,
  payouts,
  slotProbabilities,
  rtpOf,
} from './payouts.js'
export type { PlinkoRisk } from './payouts.js'

export { dropBall, verifyDrop, hashServerSeed } from './fair.js'
export type { PlinkoDrop } from './fair.js'

export type { PlinkoRound, PlayPlinkoOptions } from './engine.js'
export { randomServerSeed, playPlinko } from './engine.js'
