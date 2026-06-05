/**
 * Limbo math + provably-fair result — Stake's published Limbo formula
 * (CLAUDE.md §7). One uniform float becomes a "crash point":
 *
 *   result = max(1, floor( (1 − edge) / float · 100 ) / 100)
 *
 * You pick a target multiplier; you win (paid at the target) if result ≥ target.
 * P(result ≥ t) = (1 − edge)/t, so EV = t · (1 − edge)/t = (1 − edge): a flat,
 * configurable edge that lives entirely in the probability — never in the UI.
 *
 * The vig rests on a universal base (1%) plus an optional small manager spread,
 * defaulting to 0 (wired, not "built" yet). Same shape as Crash.
 */

import { firstFloat, hashServerSeed } from '../../core/fair.js'

export { hashServerSeed }

export const MAX_MULTIPLIER = 1_000_000
export const MIN_TARGET = 1.01
export const BASE_EDGE = 0.01

export interface LimboHouseConfig {
  baseEdge: number
  spread: number
}
export const DEFAULT_LIMBO_CONFIG: LimboHouseConfig = { baseEdge: BASE_EDGE, spread: 0 }

export function totalEdge(config: LimboHouseConfig = DEFAULT_LIMBO_CONFIG): number {
  const edge = config.baseEdge + config.spread
  if (!(edge >= 0 && edge < 1)) throw new Error(`total house edge must be in [0,1), got ${edge}`)
  return edge
}

/** The result multiplier for a uniform float in [0,1). */
export function limboFromFloat(float: number, config: LimboHouseConfig = DEFAULT_LIMBO_CONFIG): number {
  const edge = totalEdge(config)
  if (float <= 0) return MAX_MULTIPLIER
  const raw = (1 - edge) / float
  const point = Math.floor(raw * 100) / 100
  return Math.min(MAX_MULTIPLIER, Math.max(1, point))
}

/** Derive a round's result from its seeds. Deterministic — provable fairness. */
export function limboFromSeeds(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  config: LimboHouseConfig = DEFAULT_LIMBO_CONFIG,
): number {
  return limboFromFloat(firstFloat(serverSeed, clientSeed, nonce), config)
}

/** Re-derive the result from revealed seeds to verify a finished round. */
export function verifyLimbo(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  expected: number,
  config: LimboHouseConfig = DEFAULT_LIMBO_CONFIG,
): boolean {
  return limboFromSeeds(serverSeed, clientSeed, nonce, config) === expected
}

/** The win chance (%) for a target multiplier. */
export function winChanceFor(target: number, config: LimboHouseConfig = DEFAULT_LIMBO_CONFIG): number {
  return (100 * (1 - totalEdge(config))) / target
}
