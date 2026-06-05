/**
 * Crash module public surface (CLAUDE.md §7).
 * The clean UI slice and any caller import from here.
 */

export {
  MAX_CRASH_MULTIPLIER,
  BASE_EDGE,
  DEFAULT_CRASH_CONFIG,
  totalEdge,
  crashPointFromInt,
  crashPointFromSeeds,
  verifyCrashPoint,
  hashServerSeed,
} from './fair.js'
export type { CrashHouseConfig } from './fair.js'

export { GROWTH_PER_SECOND, multiplierAt, elapsedForMultiplier } from './curve.js'

export type {
  CrashGame,
  CrashStatus,
  CreateCrashOptions,
  CrashProof,
} from './engine.js'
export {
  randomServerSeed,
  createCrashGame,
  cashOut,
  crashRound,
  revealProof,
} from './engine.js'
