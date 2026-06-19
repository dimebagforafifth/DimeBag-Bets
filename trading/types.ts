/**
 * Trading Desk — shared schemas (Round 2, Lane B). The operator's post-pipeline controls that sit
 * AFTER Lane A's pricing pipeline (SGO normalize → devig → applyMargin) and BEFORE publish:
 * line overrides, stake/payout limits, and market suspensions, plus the pricing-config rows the
 * desk writes back to Lane A.
 *
 * No money lives here — limits/suspensions are ENFORCED at the existing core placement path
 * (every wager still goes through `core` in integer cents). Credits/balance only.
 */

/** What a control is scoped to. 'global' = the whole book; 'sport' = an SGO sportID; 'market' =
 *  a market family key (a marketType like 'total', or a specific marketId). */
export type TradingScope = 'global' | 'sport' | 'market'

/** How close to kick-off a limit applies — books tighten as the event nears. */
export type TimeToEventTier = 'far' | 'mid' | 'near'

/**
 * A manual price override on one selection. While active (and un-expired) the publish gate
 * REPLACES the pipeline price with `override_odds` (American). `override_prob` is an optional
 * audit of the intended true probability; it is not used to price (the odds are authoritative).
 */
export interface LineOverride {
  id: string
  marketId: string
  selectionId: string
  /** The forced display price (American), e.g. -150. */
  override_odds: number
  /** Optional intended true prob (0..1) for the audit trail. */
  override_prob: number | null
  reason: string
  set_by: string
  set_at: number
  /** Null = no expiry; otherwise the override stops applying at this epoch ms. */
  expires_at: number | null
  active: boolean
}

/** A per-scope stake/payout ceiling. The most specific active row that matches a wager wins
 *  (market > sport > global). */
export interface MarketLimit {
  id: string
  scope: TradingScope
  /** The key the scope matches on: '' for global, the sportID for sport, the marketType/marketId
   *  for market. */
  scope_key: string
  max_stake_cents: number
  max_payout_cents: number
  /** Whether this ceiling also applies to in-play wagers. */
  applies_inplay: boolean
  time_to_event_tier: TimeToEventTier
  set_by: string
  active: boolean
}

/** A market suspension. The actual suspended FLAG is shared with the risk system
 *  (app/risk-controls suspendMarket) so manual + auto-suspend + exposure see one view; this
 *  record carries the operator metadata. `scope_key` is the risk key (marketType or sportID). */
export interface MarketSuspension {
  scope: TradingScope
  scope_key: string
  suspended: boolean
  reason: string
  by: string
  at: number
}

/* ───────────────────────────── pricing config (Lane A interface) ─────────────────────────────
 * Lane A owns the pricing pipeline + `pricing_config`; Lane B's Trading Desk READS/WRITES these
 * rows (margin, posture, de-vig method) and Lane A's devig/applyMargin consume them. Until A's
 * authoritative store lands this is the interface B writes against.
 * // SEAM (Lane A / wiring): replace this store with A's pricing_config; keep the row shape.
 */

export type MarginPosture = 'recreational' | 'balanced' | 'sharp'
export type DevigMethod = 'multiplicative' | 'additive' | 'power' | 'shin'

/** One pricing-config row. `key` is '' (global), a sportID, or a marketType. A row inherits the
 *  global row for any unset field. `margin_floor` is the manager's hard minimum an agent edit may
 *  not undercut (agents inherit; they can only ADD margin, never widen below the floor). */
export interface PricingConfigRow {
  scope: TradingScope
  key: string
  /** Base margin (overround) as a fraction, e.g. 0.045 = 4.5%. */
  margin: number
  /** Manager floor on `margin` — an agent override is clamped to at least this. */
  margin_floor: number
  posture: MarginPosture
  devig_method: DevigMethod
}
