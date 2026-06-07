/**
 * Sic Bo provably-fair roll (CLAUDE.md §6). Three dice, each 1..6, are derived
 * from the first three floats off the shared stream:
 *   die_i = 1 + floor(float_i × 6)   (uniform over 1..6).
 * Deterministic in the seeds — the roll is fully verifiable after the fact, and
 * the player's choice of which bets to back never touches the seed-derived dice.
 */

import { floatStream, hashServerSeed } from '../../core/fair.js'

export { hashServerSeed }

/** A single roll of the three dice. */
export type Dice = [number, number, number]

/** Roll the three dice (each 1..6) from the seeds. */
export function rollDice(serverSeed: string, clientSeed: string, nonce: number): Dice {
  const gen = floatStream(serverSeed, clientSeed, nonce)
  const die = () => 1 + Math.min(5, Math.floor((gen.next().value as number) * 6))
  return [die(), die(), die()]
}

/** Re-derive the roll from revealed seeds to verify a round. */
export function verifyRoll(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  expected: Dice,
): boolean {
  const got = rollDice(serverSeed, clientSeed, nonce)
  return got.length === expected.length && got.every((d, i) => d === expected[i])
}
