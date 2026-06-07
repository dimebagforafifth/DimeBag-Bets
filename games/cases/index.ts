/**
 * Cases module public surface (CLAUDE.md §6).
 */

/** Self-declared identity for the games registry / casino hub. */
export const casesMeta = {
  key: 'cases',
  supportsAdjustableEdge: true,
  name: 'Cases',
  tagline: 'Open the case — slide to your multiplier.',
  accent: '#ffb84d',
} as const

export {
  RISKS,
  DEFAULT_CASES_CONFIG,
  buildTiers,
  rtpOf,
  cumulativeWeights,
} from './payouts.js'
export type { CasesRisk, CasesHouseConfig, Tier } from './payouts.js'

export { openCase, verifyCase, hashServerSeed } from './fair.js'
export type { CaseResult } from './fair.js'

export type { CasesRound, PlayCasesOptions } from './engine.js'
export { randomServerSeed, playCases } from './engine.js'
