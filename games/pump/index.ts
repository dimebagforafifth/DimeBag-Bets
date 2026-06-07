/**
 * Pump module public surface (CLAUDE.md §7). Inflate the balloon one pump at a
 * time — the multiplier climbs with each pump; bank it before it pops.
 */

/** Self-declared identity for the games registry / casino hub. */
export const pumpMeta = {
  key: 'pump',
  supportsAdjustableEdge: true,
  name: 'Pump',
  tagline: 'Inflate the balloon, bank it before it pops.',
  accent: '#ff5c7a',
} as const

export {
  CELLS,
  HOUSE_EDGE,
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  DEFAULT_HOUSE_CONFIG,
  maxPumps,
  rawMultiplier,
  pumpMultiplier,
  nextSurviveChance,
} from './multiplier.js'
export type {
  PumpDifficulty,
  PumpLevelConfig,
  PumpHouseConfig,
  PayoutRounding,
} from './multiplier.js'

export { derivePops, verifyPops, hashServerSeed } from './fair.js'

export {
  randomServerSeed,
  createPumpGame,
  pump,
  cashOut,
  currentMultiplier,
  nextMultiplier,
  revealProof,
} from './engine.js'
export type { PumpGame, PumpStatus, CreatePumpOptions, PumpResult, FairProof } from './engine.js'
