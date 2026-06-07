/**
 * Cases provably-fair open (CLAUDE.md §3, §6). One float off the shared stream
 * picks the landing tier by walking the tiers' cumulative probability weights:
 * the first tier whose cumulative boundary the float falls under wins.
 *
 * Deterministic in (serverSeed, clientSeed, nonce) — the reveal animation only
 * slides to the tier this derivation already chose, never the reverse.
 */

import { firstFloat, hashServerSeed } from '../../core/fair.js'
import {
  buildTiers,
  cumulativeWeights,
  DEFAULT_CASES_CONFIG,
  type CasesHouseConfig,
  type CasesRisk,
} from './payouts.js'

export { hashServerSeed }

export interface CaseResult {
  /** Index into the tier table (0 = blank). */
  tierIndex: number
  /** The multiplier that tier pays. */
  multiplier: number
}

/** The tier a case opens to, chosen by a single float over cumulative weights. */
export function openCase(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  risk: CasesRisk,
  config: CasesHouseConfig = DEFAULT_CASES_CONFIG,
): CaseResult {
  const tiers = buildTiers(risk, config)
  const cum = cumulativeWeights(tiers)
  const f = firstFloat(serverSeed, clientSeed, nonce)

  let tierIndex = tiers.length - 1 // float in [0,1); guard against fp drift on the last edge
  for (let i = 0; i < cum.length; i++) {
    if (f < cum[i]) {
      tierIndex = i
      break
    }
  }
  return { tierIndex, multiplier: tiers[tierIndex].multiplier }
}

/** Re-derive the opened tier from revealed seeds to verify a round. */
export function verifyCase(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  risk: CasesRisk,
  expected: CaseResult,
  config: CasesHouseConfig = DEFAULT_CASES_CONFIG,
): boolean {
  const r = openCase(serverSeed, clientSeed, nonce, risk, config)
  return r.tierIndex === expected.tierIndex && r.multiplier === expected.multiplier
}
