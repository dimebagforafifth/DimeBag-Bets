/**
 * Arbitrage & market-safety checks (CLAUDE.md §4).
 *
 * When the implied probabilities across a market's outcomes sum to LESS than 1
 * (overround < 1), a bettor can back every outcome and lock a guaranteed profit
 * — an "arb". A book never wants to post one. Staking each outcome in proportion
 * to 1/decimal returns the same `1/overround` whoever wins, so the guaranteed
 * profit is `1/overround − 1`.
 *
 * For the trading desk, `marketSafety` is the one-call guard: a posted market is
 * safe only if it is NOT arbable and (given the book's own fair probabilities)
 * is not leaking +EV on any outcome.
 */

import { overround } from './margin.js'
import { balancedStakeFractions } from './book.js'
import { expectedValue } from './value.js'

export interface ArbitrageResult {
  isArbitrage: boolean
  overround: number
  /** Guaranteed profit per 1 unit of total stake (> 0 only when isArbitrage). */
  profitMargin: number
  /** The guaranteed return on total stake whoever wins: 1 / overround. */
  returnMultiple: number
  /** Stake split (sums to 1) that locks the equal return: ∝ 1/decimal. */
  stakeFractions: number[]
}

/**
 * Analyse a market's best prices for an arbitrage. Reuses `overround` (so it
 * validates ≥2 outcomes, every decimal > 1) and the same `∝ 1/decimal` hedge as
 * a balanced book.
 */
export function arbitrage(decimals: number[]): ArbitrageResult {
  const o = overround(decimals)
  const returnMultiple = 1 / o
  return {
    isArbitrage: o < 1,
    overround: o,
    profitMargin: returnMultiple - 1,
    returnMultiple,
    stakeFractions: balancedStakeFractions(decimals),
  }
}

export interface MarketSafety {
  safe: boolean
  /** A bettor could lock a guaranteed profit across these prices. */
  arbable: boolean
  overround: number
  /** Indices the book is offering at +EV to bettors (only if `fairProbs` given). */
  valueOutcomes: number[]
}

/**
 * Book-side safety check for a posted market. Unsafe if it's arbable, or — when
 * the book's own fair probabilities are supplied — if any outcome is priced
 * +EV for the bettor (a leak the book is giving away).
 */
export function marketSafety(decimals: number[], fairProbs?: number[]): MarketSafety {
  const o = overround(decimals)
  const arbable = o < 1
  let valueOutcomes: number[] = []
  if (fairProbs) {
    if (fairProbs.length !== decimals.length) {
      throw new Error(`need one fair probability per outcome (${decimals.length}), got ${fairProbs.length}`)
    }
    valueOutcomes = decimals
      .map((d, i) => (expectedValue(fairProbs[i], d) > 0 ? i : -1))
      .filter((i) => i >= 0)
  }
  return { safe: !arbable && valueOutcomes.length === 0, arbable, overround: o, valueOutcomes }
}
