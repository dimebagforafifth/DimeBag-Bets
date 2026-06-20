/**
 * The boost runtime — the settlement-driven issuance + the slip-price preview.
 *
 * THE money rule: a boost NEVER touches placement or pays from a second source. The bet is placed
 * and settled at its true price through core. When a winning bet qualifies, the uplift is issued
 * via the bonus engine's targeted grant path (`grantRuleTo`) — so a boost is a real bonus grant
 * (capped, with playthrough + expiry), audited through core exactly like any other bonus.
 *
 * // SEAM (wiring): `armBoostEngine()` subscribes to core settlement; the wiring pass calls it at
 * app start (and the panel on mount), like `armBonusEngine`. It's opt-in, so with nothing armed
 * the boost layer grants nothing — byte-identical to no boosts.
 */

import { onWagerPlaced, onWagerResolved, type ResolveEvent } from '../core/index.js'
import { getBets } from '../app/book/bets-store.js'
import { getBook } from '../app/book-store.js'
import { slipQuote, type SlipLeg, type SlipMode } from '../app/book/slip.js'
import {
  eligibilityContext,
  grantRuleTo,
  isEligible,
  upsertBonusRule,
  type BonusGrant,
  type EligibilityContext,
} from '../bonus/index.js'
import { enabledBoosts, getBoosts, ruleForBoost } from './store.js'
import { bestOddsBoost, matchesQualifier, qualifyingBoosts, type QualifyingSlip } from './match.js'
import { boostedQuote, upliftCents, type BoostedQuote } from './pricing.js'
import type { BoostDef } from './types.js'

/** The base (cents) a boost's pct is applied to for a settled WIN:
 *  - profit boost: the winnings (profit);
 *  - odds boost:   the true return (stake + profit) — so return × pct% is the line improvement. */
function upliftBaseCents(def: BoostDef, e: ResolveEvent): number {
  return def.boostType === 'odds' ? e.stake + e.profit : e.profit
}

/** The uplift a boost would actually grant for a base — pct% of the base, AFTER the max-win cap.
 *  Ranking by this (not the pre-cap value) picks the boost that pays the player the most. */
function cappedUpliftCents(def: BoostDef, baseCents: number): number {
  const raw = upliftCents(baseCents, def.pct)
  return def.maxWinCents != null ? Math.min(raw, def.maxWinCents) : raw
}

/** Whether the player is eligible for a boost. `ctx` lets the caller pass an AT-PLACEMENT snapshot
 *  (so a settlement check isn't fooled by the just-applied win); absent, it reads live state. */
function eligibleFor(def: BoostDef, playerId: string, ctx?: EligibilityContext): boolean {
  const org = getBook()
  if (!org.members[playerId]) return false
  return isEligible(ruleForBoost(def), ctx ?? eligibilityContext(org, playerId))
}

// Bets already boosted this session — idempotency. core.resolveWager throws on a re-resolve, so a
// wager only settles once; this is belt-and-suspenders against any double-fire so a boost can
// never be issued twice for one bet.
const boostedBets = new Set<string>()

// Eligibility snapshotted when a bet was PLACED (pre-win), keyed by wager id — so a boost is
// gated on the player's state at bet time, not after settlement has already moved their figure
// (a winning bet must not disqualify a "down/at-risk" player from the boost it earned).
const placementCtx = new Map<string, EligibilityContext>()

/**
 * On a settled WIN, issue the single best qualifying+eligible boost's uplift through the engine.
 * At most ONE boost per bet (no stacking) — the one whose uplift is largest. Returns the grant(s)
 * created (0 or 1). A loss/push/void, an unknown bet, or no eligible boost grants nothing.
 */
export function settleBoostsForBet(e: ResolveEvent, now = Date.now()): BonusGrant[] {
  if (e.outcome !== 'win' || e.profit <= 0) return []
  if (boostedBets.has(e.wagerId)) return [] // already boosted this bet
  const bet = getBets().find((b) => b.id === e.wagerId)
  if (!bet || bet.legs.length === 0) return [] // not a sportsbook slip (e.g. a casino round)

  // Gate on the player's state WHEN THEY PLACED the bet (snapshot), not after the win moved it.
  const placeCtx = placementCtx.get(e.wagerId)
  const slip: QualifyingSlip = { legs: bet.legs, mode: bet.mode, decimal: bet.decimal }
  const eligible = qualifyingBoosts(slip, getBoosts()).filter((d) =>
    eligibleFor(d, e.accountId, placeCtx),
  )
  if (eligible.length === 0) return []

  // Pick the boost that PAYS the most — ranked by the capped uplift (not the pre-cap value, which
  // could prefer a high-pct boost whose low cap pays less). Deterministic tie-break by id.
  const best = eligible
    .slice()
    .sort(
      (a, b) =>
        cappedUpliftCents(b, upliftBaseCents(b, e)) - cappedUpliftCents(a, upliftBaseCents(a, e)) ||
        a.id.localeCompare(b.id),
    )[0]

  // Self-heal any def/rule desync (e.g. a def loaded without its engine rule) before issuing.
  upsertBonusRule(ruleForBoost(best))
  // Issue through the engine's grant path — max-win capped, playthrough + expiry attached,
  // core.grant inside mutateBook. Pass the at-placement context so the engine's eligibility
  // re-check uses the same pre-win state (not the figure this very win just moved). Null if skipped.
  const ticket = grantRuleTo(
    best.id,
    e.accountId,
    { refStakeCents: upliftBaseCents(best, e) },
    now,
    placeCtx,
  )
  if (ticket) boostedBets.add(e.wagerId)
  return ticket ? [ticket] : []
}

let armed: (() => void) | null = null

/** Connect the boost layer to settlement (opt-in). Idempotent. // SEAM: wiring/panel arm it. */
export function armBoostEngine(): () => void {
  if (armed) return armed
  boostedBets.clear() // a fresh arm starts with a clean idempotency set
  placementCtx.clear()
  // Snapshot eligibility at PLACEMENT (pre-win) so the settlement check isn't fooled by the win.
  const offPlaced = onWagerPlaced((e) => {
    if (getBook().members[e.accountId])
      placementCtx.set(e.wagerId, eligibilityContext(getBook(), e.accountId))
  })
  const offResolved = onWagerResolved((e) => {
    try {
      settleBoostsForBet(e)
    } catch {
      /* a boost must never break settlement */
    }
    placementCtx.delete(e.wagerId) // prune the snapshot once the bet has resolved
  })
  armed = () => {
    offPlaced()
    offResolved()
    armed = null
  }
  return armed
}

export function isBoostEngineArmed(): boolean {
  return armed != null
}

/** Tear down the settlement subscription + the per-bet idempotency set (tests + panel unmount). */
export function __disarmBoostEngine(): void {
  if (armed) armed()
  boostedBets.clear()
  placementCtx.clear()
}

/* ------------------------------- slip-price preview ------------------------- */

export interface BoostPreview {
  boost: BoostDef
  quote: BoostedQuote
}

/**
 * Preview the best ODDS boost for a live slip — the improved decimal + return shown on the slip.
 * If `playerId` is given, only boosts the player is eligible for are considered. Returns null when
 * no odds boost applies. Pure read (no money).
 */
export function previewBoostedSlip(
  legs: SlipLeg[],
  mode: SlipMode,
  stakeCents: number,
  playerId?: string,
): BoostPreview | null {
  if (legs.length === 0) return null
  // An odds boost improves a COMBINED price; a multi-leg singles slip has no single combined
  // decimal (each leg prices on its own), so there's nothing to preview.
  if (mode === 'single' && legs.length > 1) return null
  const decimal = slipQuote(legs, mode, stakeCents).decimal
  const slip: QualifyingSlip = { legs, mode, decimal }
  const pool = playerId ? getBoosts().filter((d) => eligibleFor(d, playerId)) : getBoosts()
  const boost = bestOddsBoost(slip, pool)
  if (!boost) return null
  return { boost, quote: boostedQuote(stakeCents, decimal, boost.pct) }
}

/** The enabled boosts a player is currently eligible for — for the player-facing list. */
export function availableBoostsFor(playerId: string): BoostDef[] {
  return enabledBoosts().filter((d) => eligibleFor(d, playerId))
}

/** Whether a (live or settled) slip would qualify for a given boost — for UI badges. */
export function slipQualifies(def: BoostDef, slip: QualifyingSlip): boolean {
  return def.enabled && matchesQualifier(def.qualifier, slip)
}
