/**
 * Promos: odds boosts & free/bonus bets (CLAUDE.md §4) — the marketing levers
 * every regular book pulls.
 *
 * - A **profit boost** lifts the PROFIT portion of a price by a percentage (a
 *   "+50% profit boost" turns a 3.00 into a 4.00). The stake is unaffected.
 * - A **boosted price** simply swaps in a better posted decimal (e.g. 4/1 → 5/1).
 * - A **free / bonus bet** does NOT return the stake on a win — you keep only the
 *   winnings — so its cash value is less than its face stake.
 *
 * Pure number work that settles through `core` via the resulting payout
 * multiplier (free bets settle at `decimal − 1`, since the stake isn't returned).
 */

function assertDecimal(decimal: number): void {
  if (!(decimal > 1) || !Number.isFinite(decimal)) throw new Error(`decimal odds must be > 1, got ${decimal}`)
}

/**
 * Apply a profit boost: the profit `(decimal − 1)` grows by `boostPct`
 * (0.5 = +50%), the stake stays. `boostProfit(3.0, 0.5) = 1 + 2·1.5 = 4.0`.
 */
export function boostProfit(decimal: number, boostPct: number): number {
  assertDecimal(decimal)
  if (!(boostPct >= 0)) throw new Error(`boostPct must be ≥ 0, got ${boostPct}`)
  return 1 + (decimal - 1) * (1 + boostPct)
}

/** The implied boost percentage that turns `fromDecimal` into `toDecimal`. */
export function boostPercentFor(fromDecimal: number, toDecimal: number): number {
  assertDecimal(fromDecimal)
  assertDecimal(toDecimal)
  if (!(toDecimal >= fromDecimal)) throw new Error('a boost must improve the price')
  return (toDecimal - 1) / (fromDecimal - 1) - 1
}

/**
 * Total return on a cash bet at a boosted price: stake back + boosted profit.
 * Matches `core`: `stake + round(stake × (boostedDecimal − 1))`.
 */
export function boostedReturn(stakeCents: number, decimal: number, boostPct: number): number {
  const boosted = boostProfit(decimal, boostPct)
  return stakeCents + Math.round(stakeCents * (boosted - 1))
}

/**
 * The winnings on a **free/bonus bet**: the stake is NOT returned, so a win pays
 * only the profit `stake × (decimal − 1)`. This is the payout the bettor banks;
 * the book settles it at multiplier `(decimal − 1)` rather than `decimal`.
 */
export function freeBetReturn(stakeCents: number, decimal: number): number {
  assertDecimal(decimal)
  if (!(stakeCents >= 0)) throw new Error(`stake must be ≥ 0, got ${stakeCents}`)
  return Math.round(stakeCents * (decimal - 1))
}

/**
 * The cash-equivalent value of a free bet of `stakeCents` played at `decimal`,
 * assuming a fair win probability of `1/decimal`:
 *
 *   value = stake × (decimal − 1) / decimal
 *
 * A free bet is worth ~70–80% of its face value at typical prices, and more on
 * longshots (where keeping only the winnings costs you less of the stake).
 */
export function freeBetValue(stakeCents: number, decimal: number): number {
  assertDecimal(decimal)
  if (!(stakeCents >= 0)) throw new Error(`stake must be ≥ 0, got ${stakeCents}`)
  return Math.round((stakeCents * (decimal - 1)) / decimal)
}

/** The decimal a free bet effectively pays (profit-only): `decimal − 1`. */
export function freeBetMultiplier(decimal: number): number {
  assertDecimal(decimal)
  return decimal - 1
}
