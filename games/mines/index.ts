/**
 * Mines module public surface (CLAUDE.md §7).
 * The clean UI slice and any caller import from here.
 */

/** Self-declared identity for the games registry / casino hub. */
export const minesMeta = {
  key: 'mines',
  name: 'Mines',
  tagline: 'Uncover gems, dodge the mines.',
  accent: '#3dd68c',
} as const

export {
  TOTAL_TILES,
  HOUSE_EDGE,
  DEFAULT_HOUSE_CONFIG,
  safeTiles,
  rawMultiplier,
  displayMultiplier,
  minesMultiplier,
} from './multiplier.js'
export type { MinesHouseConfig, PayoutRounding } from './multiplier.js'

export { deriveMines, hashServerSeed, verifyMines } from './fair.js'

export type {
  MinesGame,
  MinesStatus,
  CreateMinesOptions,
  RevealResult,
  FairProof,
} from './engine.js'
export {
  randomServerSeed,
  currentMultiplier,
  nextMultiplier,
  createMinesGame,
  revealTile,
  cashOut,
  revealProof,
} from './engine.js'
