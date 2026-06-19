/**
 * Dice math + provably-fair roll — Stake's model (CLAUDE.md §7).
 *
 * A single uniform roll in [0, 100). You pick a target and a direction; the
 * multiplier is set so every win chance has the same edge:
 *
 *   multiplier = 100·(1 − edge) / winChance%
 *
 * The whole house edge is that `(1 − edge)` factor — it only scales the payout,
 * the roll is always uniform. Edge is manager-configurable (default 1%).
 */

import { firstFloat, hashServerSeed } from '../../core/fair.js'

export { hashServerSeed }

export type DiceDirection = 'over' | 'under'

/** Win chance is clamped to this band, bounding the multiplier (≈1.01×–9900×). */
export const MIN_WIN_CHANCE = 0.01
export const MAX_WIN_CHANCE = 98

export interface DiceHouseConfig {
  /** House edge, e.g. 0.01 = 1%. Manager-configurable. */
  edge: number
}
export const DEFAULT_DICE_CONFIG: DiceHouseConfig = { edge: 0.01 }

/** The roll for a round: a uniform number in [0, 100), to 2 decimals. */
export function rollFromSeeds(serverSeed: string, clientSeed: string, nonce: number): number {
  return Math.floor(firstFloat(serverSeed, clientSeed, nonce) * 100 * 100) / 100
}

/** Re-derive a roll from revealed seeds to verify a finished round. */
export function verifyRoll(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  expected: number,
): boolean {
  return rollFromSeeds(serverSeed, clientSeed, nonce) === expected
}

/** The win chance (%) for a target + direction — the priced probability. */
export function winChance(target: number, direction: DiceDirection): number {
  const chance = direction === 'over' ? 100 - target : target
  return Math.min(MAX_WIN_CHANCE, Math.max(MIN_WIN_CHANCE, chance))
}

/**
 * The target the round actually settles against. When the requested target would
 * push the win chance outside the [MIN,MAX] band, `winChance` clamps it (to keep
 * the payout bounded) — so the settled target must move to match, or the priced
 * odds and the settled odds disagree and the edge is wrong (even negative) at the
 * extremes. Inside the band this is exactly `target`, so normal play is unchanged.
 */
export function effectiveTarget(target: number, direction: DiceDirection): number {
  const chance = winChance(target, direction)
  return direction === 'over' ? 100 - chance : chance
}

/** The payout multiplier for a win chance under a house config. */
export function multiplierFor(chance: number, config: DiceHouseConfig = DEFAULT_DICE_CONFIG): number {
  const raw = (100 * (1 - config.edge)) / chance
  return Math.floor(raw * 10000) / 10000
}

/**
 * Did this roll win? Settles against the effective (clamped) target so the win
 * condition always matches the priced `winChance` — closing the extreme-target
 * mismatch where a clamped chance was paid against the raw, unclamped target.
 *
 * Note: an exact tie (roll === effective target) is NOT a win here — see
 * `gradeRoll`, which classifies that as a push (stake returned).
 */
export function isWin(roll: number, target: number, direction: DiceDirection): boolean {
  const t = effectiveTarget(target, direction)
  return direction === 'over' ? roll > t : roll < t
}

/** The three settlement outcomes a round can land on. */
export type DiceOutcome = 'win' | 'push' | 'loss'

/**
 * Grade a roll three ways against the effective (clamped) target. An exact tie —
 * the roll landing on the boundary — is a PUSH: the stake is returned, per the
 * house rules, rather than lost. Anything strictly past the target wins; anything
 * short of it loses. Both the roll and the target are 2-decimal values in [0,100),
 * so an exact equality is a real (if rare) outcome, not a floating-point artifact.
 */
export function gradeRoll(roll: number, target: number, direction: DiceDirection): DiceOutcome {
  const t = effectiveTarget(target, direction)
  if (roll === t) return 'push'
  return (direction === 'over' ? roll > t : roll < t) ? 'win' : 'loss'
}
