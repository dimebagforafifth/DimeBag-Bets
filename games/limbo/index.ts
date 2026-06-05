/**
 * Limbo module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const limboMeta = {
  key: 'limbo',
  name: 'Limbo',
  tagline: 'Set a target — will the multiplier clear it?',
  accent: '#a78bfa',
} as const

export {
  MAX_MULTIPLIER,
  MIN_TARGET,
  BASE_EDGE,
  DEFAULT_LIMBO_CONFIG,
  totalEdge,
  limboFromFloat,
  limboFromSeeds,
  verifyLimbo,
  winChanceFor,
  hashServerSeed,
} from './fair.js'
export type { LimboHouseConfig } from './fair.js'

export type { LimboRound, PlayLimboOptions } from './engine.js'
export { randomServerSeed, playLimbo } from './engine.js'
