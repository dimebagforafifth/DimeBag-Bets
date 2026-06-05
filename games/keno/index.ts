/**
 * Keno module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const kenoMeta = {
  key: 'keno',
  name: 'Keno',
  tagline: 'Pick your numbers, watch the draw.',
  accent: '#22d3ee',
} as const

export { GRID_SIZE, DRAW_COUNT, MAX_PICKS, drawNumbers, verifyDraw, hashServerSeed } from './fair.js'

export {
  RISKS,
  DEFAULT_KENO_CONFIG,
  hitProbabilities,
  buildPaytable,
  rtpOf,
} from './paytable.js'
export type { KenoRisk, KenoHouseConfig } from './paytable.js'

export type { KenoRound, PlayKenoOptions } from './engine.js'
export { randomServerSeed, playKeno } from './engine.js'
