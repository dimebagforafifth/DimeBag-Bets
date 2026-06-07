/**
 * Diamonds module public surface (CLAUDE.md §6).
 */

/** Self-declared identity for the games registry / casino hub. */
export const diamondsMeta = {
  key: 'diamonds',
  supportsAdjustableEdge: true,
  name: 'Diamonds',
  tagline: 'Reveal five gems — match colours to win.',
  accent: '#5ad1ff',
} as const

export { COLOURS, GEMS, drawGems, verifyGems, hashServerSeed } from './fair.js'

export {
  PATTERNS,
  PATTERN_LABELS,
  DEFAULT_DIAMONDS_CONFIG,
  patternProbabilities,
  buildPaytable,
  rtpOf,
  classify,
} from './payouts.js'
export type { Pattern, DiamondsHouseConfig } from './payouts.js'

export type { DiamondsRound, PlayDiamondsOptions } from './engine.js'
export { randomServerSeed, playDiamonds } from './engine.js'
