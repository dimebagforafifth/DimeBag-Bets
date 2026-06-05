/**
 * Plinko provably-fair drop (CLAUDE.md §7). The ball falls through `rows` pegs;
 * each peg is one independent 50/50 over the shared float stream (same primitive
 * as Mines/Keno): float < 0.5 → left (0), else right (1). The landing slot is the
 * number of rights (0..rows), which makes slots binomially distributed — exactly
 * Stake's scheme. Deterministic in the seeds, so a finished drop is verifiable.
 */

import { floatStream, hashServerSeed } from '../../core/fair.js'
import { MAX_ROWS, MIN_ROWS } from './payouts.js'

export { hashServerSeed, MIN_ROWS, MAX_ROWS }

export interface PlinkoDrop {
  /** One bit per row: 0 = bounced left, 1 = bounced right. Length === rows. */
  path: number[]
  /** Landing slot 0..rows — the count of right-bounces. */
  slot: number
}

/** Drop a ball through `rows` pegs from the seeds; returns its path + slot. */
export function dropBall(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  rows: number,
): PlinkoDrop {
  if (!Number.isInteger(rows) || rows < MIN_ROWS || rows > MAX_ROWS) {
    throw new Error(`rows must be an integer in ${MIN_ROWS}..${MAX_ROWS}, got ${rows}`)
  }
  const floats = floatStream(serverSeed, clientSeed, nonce)
  const path: number[] = []
  let slot = 0
  for (let r = 0; r < rows; r++) {
    const right = floats.next().value >= 0.5 ? 1 : 0
    path.push(right)
    slot += right
  }
  return { path, slot }
}

/** Re-derive the drop from revealed seeds to verify a finished round. */
export function verifyDrop(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  rows: number,
  expectedSlot: number,
): boolean {
  return dropBall(serverSeed, clientSeed, nonce, rows).slot === expectedSlot
}
