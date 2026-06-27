/**
 * Wheel module public surface (CLAUDE.md §7).
 */

/** Self-declared identity for the games registry / casino hub. */
export const wheelMeta = {
  key: 'wheel',
  supportsAdjustableEdge: true,
  name: 'Wheel',
  tagline: 'Spin the wheel, chase the multiplier.',
  accent: '#f0be4a',
} as const

export {
  RISKS,
  SEGMENT_OPTIONS,
  DEFAULT_WHEEL_CONFIG,
  buildWheel,
  rtpOf,
  legend,
} from './payouts.js'
export type { WheelRisk, WheelHouseConfig } from './payouts.js'

export { spinSegment, verifySpin, hashServerSeed } from './fair.js'

export type { WheelRound, PlayWheelOptions } from './engine.js'
export { randomServerSeed, playWheel } from './engine.js'
