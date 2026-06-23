/**
 * Boosts — profit boosts & odds/SGP boosts, modelled as bonus-engine rules (round 4, Lane B).
 *
 * A boost is an operator-composed OFFER that issues value ONLY through the existing bonus-rules
 * engine's grant path (no new money path). It has two halves:
 *   - a BONUS RULE (kind `profit-boost`) that the engine owns — it carries the uplift %, the
 *     max-win cap, playthrough, expiry and player eligibility (segment/tier/downline/figure);
 *   - a QUALIFIER (this module) — the slip/SGP predicate that decides which BETS qualify, which
 *     the bonus engine itself has no concept of.
 *
 * At settlement a winning, qualifying bet has its uplift granted through the engine
 * (`grantRuleTo`). CREDITS ONLY, integer cents.
 */

import type { BonusEligibility } from '../bonus/index.js'

/**
 * What the boost improves:
 *  - `profit`: a % uplift on the bet's WINNINGS (profit). uplift = profit × pct%.
 *  - `odds`:   an improved PRICE on a qualifying slip. The slip is shown at the boosted decimal;
 *              the extra over the true line — return × pct% — is granted at settlement, so the
 *              player nets the improved-line payout while value still flows through the engine.
 */
export type BoostType = 'profit' | 'odds'

/**
 * Which BETS a boost applies to — a pure slip predicate (every set field is ANDed; an empty
 * qualifier matches any sportsbook slip). Read off the existing slip/SGP data; never money.
 */
export interface BoostQualifier {
  /** Every leg must be in one of these SGO sports (e.g. ['BASKETBALL']). Empty = any sport. */
  sports?: string[]
  /** Every leg's market type must be in this set (e.g. ['moneyline','spread']). Empty = any. */
  marketTypes?: string[]
  /** Minimum number of legs (e.g. 3 for a "3+ leg" boost). */
  minLegs?: number
  /** Same-game parlay only (all legs on one event). */
  sgpOnly?: boolean
  /** Combined-decimal floor/ceiling the qualifying slip must price within. */
  minDecimal?: number
  maxDecimal?: number
}

/**
 * The full boost definition — this module's source of truth. Saving it upserts the matching
 * bonus-engine rule (the grant machinery); the qualifier + type live here (the slip layer).
 */
export interface BoostDef {
  /** Stable id — also the id of the bonus rule this boost drives. */
  id: string
  name: string
  enabled: boolean
  boostType: BoostType
  /** The boost percentage (e.g. 25 = +25% profit, or a +25% price boost). */
  pct: number
  /** The "up to $X" ceiling on the uplift (cents). null = uncapped (still core-audited). */
  maxWinCents: number | null
  /** Turnover multiple of the granted uplift before it clears (0 = clears instantly). */
  playthroughX: number
  /** Milliseconds until an uncleared uplift expires and is clawed back. */
  expiryMs: number
  /** Who qualifies (reuses the engine's eligibility — segment/tier/downline/figure). */
  eligibility: BonusEligibility
  /** Which bets qualify (the slip predicate). */
  qualifier: BoostQualifier
}
