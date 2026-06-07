/**
 * Roulette module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const rouletteMeta = {
  key: 'roulette',
  supportsAdjustableEdge: false,
  name: 'Roulette',
  tagline: 'Single-zero European wheel.',
  accent: '#e0444d',
} as const

export {
  POCKETS,
  WHEEL_ORDER,
  RED_NUMBERS,
  OUTSIDE_BETS,
  colorOf,
  payoutFor,
  column,
  dozen,
  spotFor,
} from './table.js'
export type { PocketColor, BetSpot } from './table.js'

export { spinPocket, verifySpin, hashServerSeed } from './fair.js'

export type { RouletteBet, RouletteRound, PlayRouletteOptions } from './engine.js'
export { randomServerSeed, playRoulette } from './engine.js'
