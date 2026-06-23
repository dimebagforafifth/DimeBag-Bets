/**
 * The post-pipeline GATE (Lane B) — runs AFTER Lane A's pricing (devig → applyMargin) and BEFORE
 * publish, and again at placement for new wagers:
 *  - applyOverrides: replace a selection's published price with a live manual override.
 *  - gateWager:      block a wager on a suspended market; reject a stake over max_stake_cents or a
 *                    potential payout over max_payout_cents. Throws BEFORE core.placeWager, so a
 *                    rejected wager holds nothing.
 *
 * Suspension shares the risk system's flag (trading/suspensions → app/risk-controls), so overrides,
 * auto-suspend and exposure all see one view. No money moves here.
 *
 * // SEAM (Lane A / wiring): `applyOverrides` is the hook A's publish pipeline calls after
 * applyMargin; `gateWager` is the hook the book's placement path calls before placeWager.
 */

import type { NormalizedEvent } from '../../lib/odds/contract.js'
import { makeOverride } from '../../lib/odds/pricing.js'
import { liveOverrideFor } from './overrides.js'
import { resolveLimit } from './limits.js'
import { isSuspended } from './suspensions.js'
import type { TimeToEventTier } from './types.js'

/** Replace each selection's published price with its live override (if any). Returns a new slate;
 *  markets/events with no override are returned by reference (no needless churn). */
export function applyOverrides(events: NormalizedEvent[], now: number): NormalizedEvent[] {
  return events.map((ev) => {
    let touched = false
    const markets = ev.markets.map((m) => {
      const hasOverride = m.selections.some((s) => liveOverrideFor(m.marketId, s.selectionId, now))
      if (!hasOverride) return m
      touched = true
      return {
        ...m,
        selections: m.selections.map((s) => {
          const o = liveOverrideFor(m.marketId, s.selectionId, now)
          return o ? { ...s, priceDisplay: makeOverride(o.override_odds) } : s
        }),
      }
    })
    return touched ? { ...ev, markets } : ev
  })
}

/** One leg's market identity, for the suspension + limit checks. */
export interface GateLeg {
  marketType: string
  marketId?: string
  sport?: string
}

export interface GateWagerInput {
  legs: GateLeg[]
  /** Stake actually at risk (the per-leg stake for singles, or the parlay stake). */
  stakeCents: number
  /** The largest potential payout (return) of the wager. */
  payoutCents: number
  inplay?: boolean
  tier?: TimeToEventTier
}

/**
 * Enforce suspensions + limits for a new wager. Throws (placing nothing) if any leg's market or
 * sport is suspended, or the stake / potential payout exceeds the most-specific active limit for
 * any leg's market. Player-facing messages (no raw cents).
 */
export function gateWager(input: GateWagerInput): void {
  const inplay = input.inplay ?? false
  // No tier default: when the caller doesn't know the wager's time-to-event tier (pre-match, no
  // event-time threading yet), `undefined` makes EVERY active limit apply — a manager's limit is
  // never silently ignored. // SEAM (live betting): pass the real tier so tier-specific ceilings
  // narrow correctly.
  const tier = input.tier

  for (const leg of input.legs) {
    // A suspension can be keyed on the market family (marketType), the sport, OR a specific
    // marketId — check all three so suspending any of them blocks the wager.
    if (
      isSuspended(leg.marketType) ||
      (leg.marketId != null && isSuspended(leg.marketId)) ||
      (leg.sport != null && isSuspended(leg.sport))
    ) {
      throw new Error('this market is suspended')
    }
  }

  for (const leg of input.legs) {
    const limit = resolveLimit({
      marketType: leg.marketType,
      marketId: leg.marketId,
      sport: leg.sport,
      inplay,
      tier,
    })
    if (!limit) continue
    if (limit.max_stake_cents > 0 && input.stakeCents > limit.max_stake_cents) {
      throw new Error('stake exceeds the market limit')
    }
    if (limit.max_payout_cents > 0 && input.payoutCents > limit.max_payout_cents) {
      throw new Error('payout exceeds the market limit')
    }
  }
}
