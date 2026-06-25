/**
 * Keno provably-fair draw (CLAUDE.md §7). 10 distinct numbers are drawn from a
 * 40-number grid by a Fisher-Yates pick-and-remove over the shared float stream
 * (same primitive as Mines). Deterministic in the seeds — provable fairness.
 */

import { floatStream, hashServerSeed, uniformSample } from '../../core/fair.js'

export { hashServerSeed }

export const GRID_SIZE = 40
export const DRAW_COUNT = 10
export const MAX_PICKS = 10

/** Draw DRAW_COUNT distinct numbers (1..GRID_SIZE), sorted ascending. */
export function drawNumbers(serverSeed: string, clientSeed: string, nonce: number): number[] {
  const pool = Array.from({ length: GRID_SIZE }, (_, i) => i + 1)
  const drawn: number[] = []
  const floats = floatStream(serverSeed, clientSeed, nonce)
  for (let k = 0; k < DRAW_COUNT; k++) {
    drawn.push(pool.splice(uniformSample(floats, pool.length), 1)[0])
  }
  return drawn.sort((a, b) => a - b)
}

/** Re-derive the draw from revealed seeds to verify a finished round. */
export function verifyDraw(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  expected: number[],
): boolean {
  const drawn = drawNumbers(serverSeed, clientSeed, nonce)
  const want = [...expected].sort((a, b) => a - b)
  return drawn.length === want.length && drawn.every((n, i) => n === want[i])
}
