/**
 * Chicken Road module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const chickenRoadMeta = {
  key: 'chickenroad',
  supportsAdjustableEdge: true,
  name: 'Chicken Road',
  tagline: 'Cross the road — cash out before the splat.',
  accent: '#f0be4a',
} as const

export {
  DIFFICULTIES,
  SPECS,
  DEFAULT_CHICKEN_CONFIG,
  laneMultiplier,
  laneMultipliers,
} from './payouts.js'
export type { Difficulty, ChickenHouseConfig, DifficultySpec } from './payouts.js'

export { crashLane, verifyCrashLane, hashServerSeed } from './fair.js'

export type {
  ChickenGame,
  ChickenStatus,
  CreateChickenOptions,
  StepResult,
  FairProof,
} from './engine.js'
export {
  randomServerSeed,
  createChickenGame,
  step,
  cashOut,
  nextMultiplier,
  revealProof,
} from './engine.js'
