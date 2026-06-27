/**
 * Dragon Tower module public surface (CLAUDE.md §7). Climb a 9-level tower,
 * pick an egg on each row, cash out before a skull ends the run.
 */

/** Self-declared identity for the games registry / casino hub. */
export const dragonTowerMeta = {
  key: 'dragon-tower',
  supportsAdjustableEdge: true,
  name: 'Dragon Tower',
  tagline: 'Climb the tower, dodge the skulls.',
  accent: '#f0be4a',
} as const

export {
  ROWS,
  HOUSE_EDGE,
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  DEFAULT_HOUSE_CONFIG,
  badTiles,
  rowWinChance,
  rawMultiplier,
  towerMultiplier,
} from './difficulty.js'
export type {
  TowerDifficulty,
  TowerLevelConfig,
  TowerHouseConfig,
  PayoutRounding,
} from './difficulty.js'

export { deriveTower, verifyTower, isSkull, hashServerSeed } from './fair.js'

export {
  randomServerSeed,
  createTowerGame,
  pickTile,
  cashOut,
  level,
  currentMultiplier,
  nextMultiplier,
  revealProof,
} from './engine.js'
export type { TowerGame, TowerStatus, CreateTowerOptions, PickResult, FairProof } from './engine.js'
