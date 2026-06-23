/**
 * Trading Desk — the gate + config behaviours that money depends on: an override publishes its
 * odds and reverts on expiry; a suspended market blocks new wagers; a limit rejects an over-max
 * stake; an agent can't widen margin below the manager floor; and the hold readout equals
 * published − true. Money is held only through core, so blocked/over-limit wagers move nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '../../core/index.js'
import { mockSlate } from '../../app/book/mockBook.js'
import { legFromSelection } from '../../app/book/slip.js'
import { placeBookBet } from '../../app/book/placement.js'
import { __resetBets, getBets } from '../../app/book/bets-store.js'
import { applyOverrides } from './gate.js'
import { setOverride, clearOverride, subscribeOverrides, __resetOverrides } from './overrides.js'
import { setLimit, __resetLimits } from './limits.js'
import { suspend, unsuspend, __resetSuspensionMeta } from './suspensions.js'
// Pricing config collapsed onto Lane A's store; the desk's margin governance is now tested in
// lib/odds/pricing-config.test.ts. Here we only reset it between gate tests.
import { __resetPricingConfig } from '../../lib/odds/pricing-config.js'
import { marketHold } from './hold.js'

const NOW = 1_000_000
const account = (): Account => ({ id: 'p1', creditLimit: 100_000_000, balance: 0, pending: 0 })

function firstMarketSelection() {
  const slate = mockSlate()
  const ev = slate[0]
  const market = ev.markets.find((m) => m.type === 'moneyline')!
  return { slate, ev, market, sel: market.selections[0] }
}

beforeEach(() => {
  __resetOverrides()
  __resetLimits()
  __resetSuspensionMeta()
  __resetPricingConfig()
  __resetBets()
})
afterEach(() => {
  __resetOverrides()
  __resetLimits()
  __resetSuspensionMeta()
  __resetPricingConfig()
})

describe('overrides — publish + expiry', () => {
  it('an active override replaces the published price; clearing it reverts', () => {
    const { slate, market, sel } = firstMarketSelection()
    const before = sel.priceDisplay.american
    setOverride({
      marketId: market.marketId,
      selectionId: sel.selectionId,
      override_odds: -160,
      reason: 'steam',
      set_by: 't',
      set_at: NOW,
    })

    const gated = applyOverrides(slate, NOW)
    const gSel = gated[0].markets.find((m) => m.marketId === market.marketId)!.selections[0]
    expect(gSel.priceDisplay.american).toBe(-160)
    expect(gSel.priceDisplay.american).not.toBe(before)

    clearOverride(market.marketId, sel.selectionId)
    const reverted = applyOverrides(slate, NOW)
    expect(
      reverted[0].markets.find((m) => m.marketId === market.marketId)!.selections[0].priceDisplay
        .american,
    ).toBe(before)
  })

  it('an override reverts once it has expired', () => {
    const { slate, market, sel } = firstMarketSelection()
    const before = sel.priceDisplay.american
    setOverride({
      marketId: market.marketId,
      selectionId: sel.selectionId,
      override_odds: -160,
      reason: 'x',
      set_by: 't',
      set_at: NOW,
      expires_at: NOW + 1000,
    })
    expect(applyOverrides(slate, NOW + 500)[0].markets[0].selections[0].priceDisplay.american).toBe(
      -160,
    )
    // after expiry the published price is the original again
    expect(
      applyOverrides(slate, NOW + 2000)[0].markets[0].selections[0].priceDisplay.american,
    ).toBe(before)
  })
})

describe('suspension — blocks new wagers (shared risk flag), holds no money', () => {
  afterEach(() => unsuspend('moneyline'))

  it('a suspended market rejects a wager and moves no money', () => {
    const { ev, market, sel } = firstMarketSelection()
    const leg = legFromSelection(ev, market, sel)
    suspend({ scope: 'market', scope_key: 'moneyline', reason: 'news', by: 'trader', at: NOW })
    const acct = account()
    expect(() =>
      placeBookBet({
        account: acct,
        playerName: 'P',
        placedBy: 'P',
        legs: [leg],
        mode: 'single',
        stakeCents: 5_000,
        now: NOW,
      }),
    ).toThrow(/suspended/)
    expect(acct.pending).toBe(0)
    expect(getBets()).toHaveLength(0)
  })
})

describe('limits — reject over-max stake/payout, hold no money', () => {
  it('rejects a stake above the market limit, placing nothing', () => {
    const { ev, market, sel } = firstMarketSelection()
    const leg = legFromSelection(ev, market, sel)
    setLimit({
      scope: 'market',
      scope_key: 'moneyline',
      max_stake_cents: 10_000,
      max_payout_cents: 100_000_000,
      set_by: 'manager',
    })
    const acct = account()
    expect(() =>
      placeBookBet({
        account: acct,
        playerName: 'P',
        placedBy: 'P',
        legs: [leg],
        mode: 'single',
        stakeCents: 50_000,
        now: NOW,
      }),
    ).toThrow(/limit/)
    expect(acct.pending).toBe(0)
    // a stake within the limit goes through
    const ok = placeBookBet({
      account: acct,
      playerName: 'P',
      placedBy: 'P',
      legs: [leg],
      mode: 'single',
      stakeCents: 10_000,
      now: NOW,
    })
    expect(ok).toHaveLength(1)
    expect(acct.pending).toBe(10_000)
  })

  it('rejects a wager whose potential payout exceeds max_payout_cents', () => {
    const { ev, market, sel } = firstMarketSelection()
    const leg = legFromSelection(ev, market, sel)
    setLimit({
      scope: 'market',
      scope_key: 'moneyline',
      max_stake_cents: 100_000_000,
      max_payout_cents: 1_000,
      set_by: 'manager',
    })
    const acct = account()
    expect(() =>
      placeBookBet({
        account: acct,
        playerName: 'P',
        placedBy: 'P',
        legs: [leg],
        mode: 'single',
        stakeCents: 5_000,
        now: NOW,
      }),
    ).toThrow(/limit/)
    expect(acct.pending).toBe(0)
  })
})

// Pricing-config margin governance (agent-clamp to the manager floor, manager-below-floor, NaN→
// floor) moved with the store to lib/odds/pricing-config.test.ts in the reconcile lane.

describe('review regressions — confirmed gate findings', () => {
  afterEach(() => {
    unsuspend('moneyline')
  })

  it('suspending a market by its specific marketId blocks the wager (not just by marketType)', () => {
    const { ev, market, sel } = firstMarketSelection()
    const leg = legFromSelection(ev, market, sel)
    suspend({ scope: 'market', scope_key: market.marketId, reason: 'news', by: 't', at: NOW })
    const acct = account()
    expect(() =>
      placeBookBet({
        account: acct,
        playerName: 'P',
        placedBy: 'P',
        legs: [leg],
        mode: 'single',
        stakeCents: 5_000,
        now: NOW,
      }),
    ).toThrow(/suspended/)
    expect(acct.pending).toBe(0)
    expect(getBets()).toHaveLength(0)
    unsuspend(market.marketId)
  })

  it('a limit set on a non-mid tier is still enforced (never silently ignored)', () => {
    const { ev, market, sel } = firstMarketSelection()
    const leg = legFromSelection(ev, market, sel)
    setLimit({
      scope: 'market',
      scope_key: 'moneyline',
      max_stake_cents: 1_000,
      max_payout_cents: 1_000_000_000,
      time_to_event_tier: 'near',
      set_by: 'm',
    })
    const acct = account()
    expect(() =>
      placeBookBet({
        account: acct,
        playerName: 'P',
        placedBy: 'P',
        legs: [leg],
        mode: 'single',
        stakeCents: 5_000,
        now: NOW,
      }),
    ).toThrow(/limit/)
    expect(acct.pending).toBe(0)
  })

  it('a specific marketId limit wins over a looser marketType-family limit, regardless of insertion order', () => {
    const { ev, market, sel } = firstMarketSelection()
    const leg = legFromSelection(ev, market, sel)
    setLimit({
      scope: 'market',
      scope_key: market.marketId,
      max_stake_cents: 1_000,
      max_payout_cents: 1_000_000_000,
      set_by: 'm',
    }) // strict, by id
    setLimit({
      scope: 'market',
      scope_key: 'moneyline',
      max_stake_cents: 1_000_000_000,
      max_payout_cents: 1_000_000_000,
      set_by: 'm',
    }) // loose family, added AFTER
    const acct = account()
    expect(() =>
      placeBookBet({
        account: acct,
        playerName: 'P',
        placedBy: 'P',
        legs: [leg],
        mode: 'single',
        stakeCents: 5_000,
        now: NOW,
      }),
    ).toThrow(/limit/)
    expect(acct.pending).toBe(0)
  })

  it('an override expiry fires a republish so the published price reverts in mock mode', () => {
    vi.useFakeTimers()
    try {
      const { market, sel } = firstMarketSelection()
      let notified = 0
      const off = subscribeOverrides(() => (notified += 1))
      setOverride({
        marketId: market.marketId,
        selectionId: sel.selectionId,
        override_odds: -160,
        reason: 'x',
        set_by: 't',
        set_at: 0,
        expires_at: 1_000,
      })
      const afterSet = notified
      vi.advanceTimersByTime(1_500) // past expiry
      expect(notified).toBeGreaterThan(afterSet) // the expiry timer fired a republish
      off()
    } finally {
      vi.useRealTimers()
    }
  })

})

describe('hold readout — hold% == published − true', () => {
  it('equals Σ published implied − 1 for a known market', () => {
    const { market } = firstMarketSelection()
    const h = marketHold(market)
    expect(h.holdPct).toBeCloseTo(h.publishedSum - 1, 9)
    expect(h.holdPct).toBeCloseTo(h.publishedSum - h.trueSum, 6) // true sums to ~1
    expect(h.holdPct).toBeGreaterThan(0) // a real book holds margin
  })
})
