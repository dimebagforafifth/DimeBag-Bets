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

/** The win chance (%) for a target + direction. */
export function winChance(target: number, direction: DiceDirection): number {
  const chance = direction === 'over' ? 100 - target : target
  return Math.min(MAX_WIN_CHANCE, Math.max(MIN_WIN_CHANCE, chance))
}

/** The payout multiplier for a win chance under a house config. */
export function multiplierFor(chance: number, config: DiceHouseConfig = DEFAULT_DICE_CONFIG): number {
  const raw = (100 * (1 - config.edge)) / chance
  return Math.floor(raw * 10000) / 10000
}

/** Did this roll win, for the chosen target + direction? */
export function isWin(roll: number, target: number, direction: DiceDirection): boolean {
  return direction === 'over' ? roll > target : roll < target
}
