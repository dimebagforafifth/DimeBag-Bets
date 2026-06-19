/**
 * Demo data so the Trading Desk renders fully populated: a couple of line overrides on real mock
 * markets, a per-sport stake/payout limit, a market suspension, and per-sport pricing-config rows.
 * No money moves — these are operator config only.
 */

import { mockSlate } from '../app/book/mockBook.js'
import { setOverride, __resetOverrides, getOverrides } from './overrides.js'
import { setLimit, __resetLimits, getLimits } from './limits.js'
import { suspend, unsuspend, listSuspensions, __resetSuspensionMeta } from './suspensions.js'
import { setMargin, setPosture, setMarginFloor, __resetPricingConfig } from './pricing-config.js'

let seeded = false

/** (Re)seed the Trading Desk config from `now`. Idempotent via ensureSeeded-style flag. */
export function seedTradingDesk(now: number): void {
  __resetTrading()

  // Manager pricing posture: a tighter floor, a sharper soccer book.
  setMarginFloor(0.02)
  setPosture('global', '', 'balanced')
  setMargin('sport', 'SOCCER', 0.05)
  setPosture('sport', 'SOCCER', 'sharp')

  // A per-sport limit (football tightened) + a global near-tip-off ceiling.
  setLimit({
    scope: 'sport',
    scope_key: 'FOOTBALL',
    max_stake_cents: 250_000,
    max_payout_cents: 2_000_000,
    set_by: 'manager',
    time_to_event_tier: 'mid',
  })

  // Suspend one prop market (shared with the risk view).
  suspend({
    scope: 'market',
    scope_key: 'prop',
    reason: 'injury news pending',
    by: 'trader',
    at: now,
  })

  // Two live overrides on the first event's main markets, if the mock slate has them.
  const slate = mockSlate()
  const ev = slate[0]
  const ml = ev?.markets.find((m) => m.type === 'moneyline')
  if (ml && ml.selections[0]) {
    setOverride({
      marketId: ml.marketId,
      selectionId: ml.selections[0].selectionId,
      override_odds: -160,
      reason: 'steam move',
      set_by: 'trader',
      set_at: now,
    })
  }
  const total = ev?.markets.find((m) => m.type === 'total')
  if (total && total.selections[0]) {
    setOverride({
      marketId: total.marketId,
      selectionId: total.selections[0].selectionId,
      override_odds: -120,
      reason: 'sharp action on the over',
      set_by: 'trader',
      set_at: now,
      expires_at: now + 60 * 60_000,
    })
  }

  seeded = true
}

/** Reset every Trading Desk store (and lift any seeded suspensions from the shared flag). */
export function __resetTrading(): void {
  for (const s of listSuspensions()) unsuspend(s.scope_key)
  __resetSuspensionMeta()
  __resetOverrides()
  __resetLimits()
  __resetPricingConfig()
  seeded = false
}

/** Whether the demo has been seeded (so the panel seeds once). */
export function isTradingSeeded(): boolean {
  return seeded || getOverrides().length > 0 || getLimits().length > 0
}
