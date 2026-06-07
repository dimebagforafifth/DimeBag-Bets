/**
 * Round robins (CLAUDE.md §4) — a staple of a regular book.
 *
 * A round robin takes a set of selections and bets EVERY combination of a given
 * size as its own parlay. Pick 4 games "by 2s" and you place all C(4,2) = 6
 * two-leg parlays; you can still profit even if a leg or two loses, unlike a
 * single 4-leg parlay where one loss kills everything.
 *
 * Pure combinatorics + pricing — it composes with the existing parlay decimal
 * (product of legs, capped at the book's max payout) and leaves placement/
 * settlement to `core`, exactly like the casino game engines.
 */

import { MAX_PARLAY_DECIMAL } from '../odds.js'

export interface RoundRobinLeg {
  label: string
  /** Decimal odds for this leg. */
  decimal: number
}

export interface RoundRobinParlay {
  legs: string[]
  decimal: number
  stake: number
  /** Total returned if this parlay wins (stake × decimal), to the point. */
  toReturn: number
}

export interface RoundRobinTicket {
  parlays: RoundRobinParlay[]
  parlayCount: number
  totalStake: number
  /** Return if exactly the single best/most parlays… here: if ALL parlays win. */
  maxReturn: number
  /** The largest single-parlay return in the set. */
  bestParlayReturn: number
}

/** Every k-combination of indices [0..n-1], in lexicographic order. */
export function combinations(n: number, k: number): number[][] {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || k > n) {
    throw new Error(`invalid combination n=${n}, k=${k}`)
  }
  const out: number[][] = []
  const combo: number[] = []
  const recurse = (start: number): void => {
    if (combo.length === k) {
      out.push([...combo])
      return
    }
    for (let i = start; i <= n - (k - combo.length); i++) {
      combo.push(i)
      recurse(i + 1)
      combo.pop()
    }
  }
  recurse(0)
  return out
}

/** The combined decimal for a parlay's legs: product, capped at the max payout. */
export function parlayDecimalOf(decimals: number[]): number {
  if (decimals.length === 0) throw new Error('a parlay needs at least one leg')
  const product = decimals.reduce((acc, d) => {
    if (!(d > 1)) throw new Error(`every leg decimal must be > 1, got ${d}`)
    return acc * d
  }, 1)
  return Math.min(MAX_PARLAY_DECIMAL, product)
}

/**
 * Build a round robin from `legs`, betting every combination of each size in
 * `sizes` (e.g. `[2]` for "by 2s", `[2, 3]` for "by 2s and 3s") at
 * `stakePerParlay` each.
 */
export function roundRobin(
  legs: RoundRobinLeg[],
  sizes: number[],
  stakePerParlay: number,
): RoundRobinTicket {
  if (legs.length < 2) throw new Error(`a round robin needs ≥2 legs, got ${legs.length}`)
  if (sizes.length === 0) throw new Error('at least one parlay size is required')
  for (const s of sizes) {
    if (!Number.isInteger(s) || s < 2 || s > legs.length) {
      throw new Error(`each size must be an integer in 2..${legs.length}, got ${s}`)
    }
  }
  if (!Number.isInteger(stakePerParlay) || stakePerParlay < 1) {
    throw new Error(`stakePerParlay must be a positive integer, got ${stakePerParlay}`)
  }

  const parlays: RoundRobinParlay[] = []
  for (const size of sizes) {
    for (const combo of combinations(legs.length, size)) {
      const decimal = parlayDecimalOf(combo.map((i) => legs[i].decimal))
      parlays.push({
        legs: combo.map((i) => legs[i].label),
        decimal,
        stake: stakePerParlay,
        toReturn: Math.round(stakePerParlay * decimal),
      })
    }
  }

  const returns = parlays.map((p) => p.toReturn)
  return {
    parlays,
    parlayCount: parlays.length,
    totalStake: parlays.length * stakePerParlay,
    maxReturn: returns.reduce((a, b) => a + b, 0),
    bestParlayReturn: Math.max(...returns),
  }
}

/** How many parlays a round robin of `n` legs across `sizes` will create. */
export function roundRobinParlayCount(n: number, sizes: number[]): number {
  return sizes.reduce((sum, k) => sum + combinations(n, k).length, 0)
}
