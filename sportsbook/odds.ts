/**
 * Sportsbook odds math (CLAUDE.md §4) — pure conversions between the American
 * odds books publish (−110, +150) and the decimal multiplier the money model
 * settles on. A decimal of 2.50 means a winning $10 returns $25 (stake × 2.50),
 * which is exactly the `payoutMultiplier` core grades a win at (§3).
 *
 * No game/event specifics here — just the number work, so it's trivially
 * testable and reused by both single bets and parlays.
 */

/** Max payout cap: 299-to-1, i.e. a decimal of 300 (CLAUDE.md §4). */
export const MAX_PARLAY_DECIMAL = 300

/** American odds → decimal multiplier (total return per unit staked). */
export function decimalFromAmerican(american: number): number {
  if (!Number.isFinite(american) || american === 0) {
    throw new Error(`american odds must be a non-zero number, got ${american}`)
  }
  return american > 0 ? 1 + american / 100 : 1 + 100 / -american
}

/** Decimal multiplier → American odds (rounded to the nearest whole price). */
export function americanFromDecimal(decimal: number): number {
  if (!(decimal > 1)) throw new Error(`decimal odds must be > 1, got ${decimal}`)
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : -Math.round(100 / (decimal - 1))
}

/** The (vig-inclusive) implied win probability of an American price. */
export function impliedProbability(american: number): number {
  return 1 / decimalFromAmerican(american)
}

/** Display an American price with its sign, e.g. "+150" / "−110". */
export function formatAmerican(american: number): string {
  return american > 0 ? `+${american}` : `−${Math.abs(american)}`
}

/**
 * Combine several American legs into one parlay decimal — the product of each
 * leg's decimal, capped at the max payout (CLAUDE.md §4). Every leg must win for
 * the parlay to win; the price compounds because the probabilities multiply.
 */
export function parlayDecimal(legs: number[]): number {
  const product = legs.reduce((acc, a) => acc * decimalFromAmerican(a), 1)
  return Math.min(MAX_PARLAY_DECIMAL, product)
}

/** Total returned on a winning bet (stake back + profit), to the penny, matching
 *  how core settles: stake + round(stake × (decimal − 1)). */
export function potentialReturn(stakeCents: number, decimal: number): number {
  return stakeCents + Math.round(stakeCents * (decimal - 1))
}
