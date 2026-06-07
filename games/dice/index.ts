/**
 * Dice module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const diceMeta = {
  key: 'dice',
  supportsAdjustableEdge: true,
  name: 'Dice',
  tagline: 'Roll over or under — set your own odds.',
  accent: '#f5a524',
} as const

export {
  MIN_WIN_CHANCE,
  MAX_WIN_CHANCE,
  DEFAULT_DICE_CONFIG,
  rollFromSeeds,
  verifyRoll,
  winChance,
  multiplierFor,
  isWin,
  hashServerSeed,
} from './fair.js'
export type { DiceDirection, DiceHouseConfig } from './fair.js'

export type { DiceRound, PlayDiceOptions } from './engine.js'
export { randomServerSeed, playDice } from './engine.js'
