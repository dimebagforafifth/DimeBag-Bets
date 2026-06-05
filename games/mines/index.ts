/**
 * Mines module public surface (CLAUDE.md §7).
 * The clean UI slice (next step) and any caller import from here.
 */

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
