/**
 * Provably-fair crash point + the house-edge model for Crash — Stake's published
 * algorithm (CLAUDE.md §6, §7).
 *
 * Stake takes the first 32 bits of HMAC-SHA256(serverSeed, clientSeed:nonce:0)
 * as an integer `int ∈ [0, 2^32)` and computes:
 *
 *   crashPoint = max(1, (2^32 / (int + 1)) × (1 − edge))   rounded to 2 dp
 *
 * The whole house edge lives in the `(1 − edge)` factor, which shifts ONLY the
 * crash-point distribution (probability). It never touches the rising-multiplier
 * curve the player sees (that's in curve.ts): changing the vig changes the odds,
 * not the UI.
 *
 * The vig rests on a universal base (the Stake 1%) plus an optional manager
 * spread, kept small relative to the base. The spread is wired but defaults to 0
 * — not "built" yet, just changeable later from one config.
 */

import { firstUint32, hashServerSeed } from '../../core/fair.js'

export { hashServerSeed }

/** Crash points are capped here; the heavy tail is astronomically rare anyway. */
export const MAX_CRASH_MULTIPLIER = 1_000_000

/** The universal/Stake base vig — the house base every round rests on. */
export const BASE_EDGE = 0.01

/**
 * Manager-controlled house settings for Crash. Total edge = base + spread.
 * The spread is the manager's discretionary add-on; keep it small relative to
 * the base. It only moves probability, never the displayed curve.
 */
export interface CrashHouseConfig {
  /** Universal base vig (the house base). Default 0.01 (1%). */
  baseEdge: number
  /** Manager's discretionary spread on top of the base. Default 0 (not built yet). */
  spread: number
}

/** Shipping default: the 1% base, no spread yet (manager can add one later). */
export const DEFAULT_CRASH_CONFIG: CrashHouseConfig = { baseEdge: BASE_EDGE, spread: 0 }

/** The effective house edge applied to the crash distribution. */
export function totalEdge(config: CrashHouseConfig = DEFAULT_CRASH_CONFIG): number {
  const edge = config.baseEdge + config.spread
  if (!(edge >= 0 && edge < 1)) {
    throw new Error(`total house edge must be in [0,1), got ${edge}`)
  }
  return edge
}

/** Round a multiplier to 2 decimals (Stake's published rounding for crash). */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * The crash point for a 32-bit draw under a house config. Exposed so the exact
 * Stake formula can be unit-tested against published worked examples.
 */
export function crashPointFromInt(
  int: number,
  config: CrashHouseConfig = DEFAULT_CRASH_CONFIG,
): number {
  const raw = (2 ** 32 / (int + 1)) * (1 - totalEdge(config))
  return Math.min(MAX_CRASH_MULTIPLIER, Math.max(1, round2(raw)))
}

/**
 * Derive a round's crash point from its seeds. Deterministic in
 * (serverSeed, clientSeed, nonce, config) — the heart of provable fairness.
 */
export function crashPointFromSeeds(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  config: CrashHouseConfig = DEFAULT_CRASH_CONFIG,
): number {
  return crashPointFromInt(firstUint32(serverSeed, clientSeed, nonce), config)
}

/** Re-derive the crash point from revealed seeds to verify a finished round. */
export function verifyCrashPoint(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  expected: number,
  config: CrashHouseConfig = DEFAULT_CRASH_CONFIG,
): boolean {
  return crashPointFromSeeds(serverSeed, clientSeed, nonce, config) === expected
}
