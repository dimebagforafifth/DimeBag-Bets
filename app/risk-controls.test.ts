/**
 * Risk controls — breach evaluation, alerts (in-app + the SMS/email hook), and auto-actions
 * that route through the EXISTING org per-member path (setMaxWager / setBettingLocked) or the
 * market-suspension flag. Money/limits move only through org — never a new path here.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getBook } from './book-store.js'
import { getMember, setBettingLocked, setMaxWager } from '../features/org/index.js'
import { consolidatedExposure, correlatedDownside } from './exposure.js'
import type { BookBet } from './book/bets-store.js'
import type { SlipLeg } from './book/slip.js'
import {
  evaluateBreaches,
  raiseAlertsForBreaches,
  raiseAlert,
  getAlerts,
  onAlert,
  runAutoActions,
  isMarketSuspended,
  getThresholds,
  __resetRiskControls,
  type Threshold,
  type Breach,
} from './risk-controls.js'

function leg(over: Partial<SlipLeg> = {}): SlipLeg {
  return {
    key: 'k', eventId: 'E1', eventLabel: 'A @ B', leagueId: 'NBA', marketId: 'E1-ml',
    marketType: 'moneyline', marketPeriod: 'game', side: 'home', pick: 'Home',
    price: { american: -110, decimal: 2.0 }, sport: 'BASKETBALL', trueProb: 0.6, ...over,
  }
}
function bet(over: Partial<BookBet> = {}): BookBet {
  return {
    id: 'b1', accountId: 'p1', playerName: 'P1', placedBy: 'P1', mode: 'single',
    legs: [leg()], stakeCents: 10_000, decimal: 2.0, status: 'open', placedAt: 0, ...over,
  }
}

const TH = (over: Partial<Threshold>): Threshold => ({
  id: 't', label: 'T', scope: 'book', metric: 'liability', limitCents: 5_000, action: 'alert', enabled: true, ...over,
})

beforeEach(() => __resetRiskControls())

describe('evaluateBreaches', () => {
  it('fires when a scope value exceeds its limit, with severity by overage', () => {
    const exp = consolidatedExposure([bet({ stakeCents: 10_000, decimal: 2.0 })]) // total liability 10_000
    const cor = correlatedDownside([])
    const warn = evaluateBreaches(exp, cor, [TH({ limitCents: 8_000 })]) // 10k vs 8k → warn
    expect(warn).toHaveLength(1)
    expect(warn[0].severity).toBe('warn')
    const crit = evaluateBreaches(exp, cor, [TH({ limitCents: 5_000 })]) // 10k ≥ 1.5×5k → critical
    expect(crit[0].severity).toBe('critical')
    expect(evaluateBreaches(exp, cor, [TH({ limitCents: 20_000 })])).toHaveLength(0) // under
  })

  it('evaluates per-market scope against the market breakdown', () => {
    const exp = consolidatedExposure([bet({ decimal: 2.0, stakeCents: 10_000 })]) // moneyline 10_000
    const breaches = evaluateBreaches(exp, correlatedDownside([]), [
      TH({ scope: 'market', scopeKey: 'moneyline', limitCents: 6_000, action: 'suspend-market' }),
    ])
    expect(breaches[0].scope).toBe('market')
    expect(breaches[0].scopeKey).toBe('moneyline')
    expect(breaches[0].action).toBe('suspend-market')
  })

  it('ships with sensible default thresholds enabled', () => {
    expect(getThresholds().every((t) => t.enabled)).toBe(true)
    expect(getThresholds().some((t) => t.scope === 'book' && t.metric === 'correlated')).toBe(true)
  })
})

describe('alerts', () => {
  it('raises an in-app alert per breach and de-dupes by threshold+scope', () => {
    const b: Breach = {
      thresholdId: 't', label: 'Book', scope: 'book', scopeKey: 'book', metric: 'liability',
      valueCents: 10_000, limitCents: 5_000, overByCents: 5_000, severity: 'critical', action: 'alert',
    }
    raiseAlert(b, 1)
    raiseAlert(b, 2) // same threshold+scope → refresh, not a second row
    expect(getAlerts()).toHaveLength(1)
    expect(getAlerts()[0].at).toBe(2)
  })

  it('fires the SMS/email hook seam on raise', () => {
    const seen: string[] = []
    const off = onAlert((a) => seen.push(a.scopeKey))
    raiseAlertsForBreaches(
      [{ thresholdId: 't', label: 'L', scope: 'book', scopeKey: 'book', metric: 'liability', valueCents: 9, limitCents: 5, overByCents: 4, severity: 'warn', action: 'alert' }],
      1,
    )
    expect(seen).toEqual(['book'])
    off()
  })
})

describe('auto-actions (routed through the existing org path)', () => {
  let restore: Array<() => void> = []
  afterEach(() => {
    restore.forEach((r) => r())
    restore = []
  })

  it('suspend-market flips the risk flag (no org mutation)', () => {
    const applied = runAutoActions(
      [{ thresholdId: 'm', label: 'ML', scope: 'market', scopeKey: 'moneyline', metric: 'liability', valueCents: 9, limitCents: 5, overByCents: 4, severity: 'critical', action: 'suspend-market' }],
      getBook(),
      1,
    )
    expect(applied).toEqual([{ action: 'suspend-market', target: 'moneyline', label: 'ML' }])
    expect(isMarketSuspended('moneyline')).toBe(true)
    expect(getAlerts()[0].acted).toBe(true) // an acted alert was raised
  })

  it('suspend-player locks the player via setBettingLocked (the editor’s own path)', () => {
    const org = getBook()
    const wasLocked = getMember(org, 'p-marco').account.bettingLocked ?? false
    restore.push(() => setBettingLocked(org, 'p-marco', wasLocked))

    runAutoActions(
      [{ thresholdId: 'p', label: 'Marco', scope: 'player', scopeKey: 'p-marco', metric: 'liability', valueCents: 9, limitCents: 5, overByCents: 4, severity: 'critical', action: 'suspend-player' }],
      org,
      1,
    )
    expect(getMember(org, 'p-marco').account.bettingLocked).toBe(true)
  })

  it('reduce-limit halves the player’s max bet through setMaxWager', () => {
    const org = getBook()
    const prev = getMember(org, 'p-dana').account.maxWager ?? null
    setMaxWager(org, 'p-dana', 20_000)
    restore.push(() => setMaxWager(org, 'p-dana', prev))

    runAutoActions(
      [{ thresholdId: 'r', label: 'Dana', scope: 'player', scopeKey: 'p-dana', metric: 'liability', valueCents: 9, limitCents: 5, overByCents: 4, severity: 'warn', action: 'reduce-limit' }],
      org,
      1,
    )
    expect(getMember(org, 'p-dana').account.maxWager).toBe(10_000) // halved
  })

  it('skips an action that doesn’t fit its scope and never throws', () => {
    expect(() =>
      runAutoActions(
        [{ thresholdId: 'x', label: 'bad', scope: 'player', scopeKey: 'nobody', metric: 'liability', valueCents: 9, limitCents: 5, overByCents: 4, severity: 'warn', action: 'suspend-player' }],
        getBook(),
        1,
      ),
    ).not.toThrow()
  })
})
