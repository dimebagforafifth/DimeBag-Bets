/**
 * Slots module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const slotsMeta = {
  key: 'slots',
  supportsAdjustableEdge: true,
  name: 'Slots',
  tagline: 'Spin the reels — line up three.',
  accent: '#ff5b8a',
} as const

export {
  SYMBOLS,
  CHERRY,
  TOTAL_WEIGHT,
  DEFAULT_SLOTS_CONFIG,
  symbolProbability,
  buildPaytable,
  twoCherryMultiplier,
  multiplierFor,
  rtpOf,
} from './payouts.js'
export type { SlotSymbol, SlotsHouseConfig } from './payouts.js'

export { REELS, spin, verifySpin, hashServerSeed } from './fair.js'

export type { SlotsRound, PlaySlotsOptions } from './engine.js'
export { randomServerSeed, playSlots } from './engine.js'
