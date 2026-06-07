/**
 * Sic Bo module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const sicBoMeta = {
  key: 'sicbo',
  supportsAdjustableEdge: false,
  name: 'Sic Bo',
  tagline: 'Three dice — call the roll.',
  accent: '#46c2a8',
} as const

export {
  totalOdds,
  singleReturn,
  betReturn,
  validateBetSpec,
  sumDice,
  isTriple,
  countFace,
  rtpOf,
  edgeOf,
  betLabel,
  comboList,
  COMBO_RETURN,
} from './payouts.js'
export type { BetType, BetSpec } from './payouts.js'

export { rollDice, verifyRoll, hashServerSeed } from './fair.js'
export type { Dice } from './fair.js'

export { randomServerSeed, playSicBo } from './engine.js'
export type {
  SicBoBet,
  SicBoBetResult,
  SicBoRound,
  PlaySicBoOptions,
} from './engine.js'
