/**
 * Crash module public surface (CLAUDE.md §7).
 * The clean UI slice and any caller import from here.
 */

/** Self-declared identity for the games registry / casino hub. */
export const crashMeta = {
  key: 'crash',
  supportsAdjustableEdge: true,
  name: 'Crash',
  tagline: 'Cash out before the rocket crashes.',
  accent: '#f0be4a',
} as const

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
  FrameDecision,
} from './engine.js'
export {
  randomServerSeed,
  createCrashGame,
  cashOut,
  crashRound,
  frameDecision,
  revealProof,
} from './engine.js'
