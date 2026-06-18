/**
 * Commission models — the three canonical PPH ways an agent gets paid, the per-member
 * setter, and how `settleOrgWeek` honours each model (including the redline make-up
 * carryover advancing across consecutive weeks). Pure math in cents; settlement still moves
 * the figures through the existing roll-up + core.settleWeek (no separate money path).
 */
import { describe, it, expect } from 'vitest'
import {
  computeCommission,
  commissionConfigOf,
  setCommissionModel,
  setCommissionPct,
  agentCommission,
  agentDistribution,
  agentPerformance,
  settleOrgWeek,
  createOrg,
  addSubAgent,
  addAgent,
  addPlayer,
  getMember,
  type Org,
} from './index.js'

/* ----------------------------- pure model math -------------------------- */

describe('computeCommission — SPLIT', () => {
  it('takes a flat % of the figure either way (earns on roster losses, shares roster wins)', () => {
    // book POV: +10,000 = the roster lost; −10,000 = the roster beat the book
    expect(computeCommission({ model: 'split', pct: 20 }, 10_000).commissionCents).toBe(2_000)
    expect(computeCommission({ model: 'split', pct: 20 }, -10_000).commissionCents).toBe(-2_000)
  })
})

describe('computeCommission — PROFIT SHARE', () => {
  it('takes a % of net player losses only, never goes negative', () => {
    expect(computeCommission({ model: 'profit_share', pct: 20 }, 10_000).commissionCents).toBe(
      2_000,
    )
    expect(computeCommission({ model: 'profit_share', pct: 20 }, -10_000).commissionCents).toBe(0)
  })
})

describe('computeCommission — REDLINE (make-up)', () => {
  it('banks the red figure, pays nothing until it clears, then pays the surplus', () => {
    // a losing-for-the-book week banks the red
    const w1 = computeCommission({ model: 'redline', pct: 25, carryoverCents: 0 }, -10_000)
    expect(w1.commissionCents).toBe(0)
    expect(w1.carryoverCents).toBe(-10_000)
    // a partial make-up: still under water, still nothing, red shrinks
    const w2 = computeCommission({ model: 'redline', pct: 25, carryoverCents: -10_000 }, 6_000)
    expect(w2.commissionCents).toBe(0)
    expect(w2.carryoverCents).toBe(-4_000)
    // clears the red and pays 25% of what's left over (−4,000 + 10,000 = 6,000)
    const w3 = computeCommission({ model: 'redline', pct: 25, carryoverCents: -4_000 }, 10_000)
    expect(w3.commissionCents).toBe(1_500)
    expect(w3.carryoverCents).toBe(0)
  })

  it('treats a positive stored carryover as cleared (red is never positive)', () => {
    const r = computeCommission({ model: 'redline', pct: 25, carryoverCents: 999 }, 4_000)
    expect(r.commissionCents).toBe(1_000) // 25% of 4,000, prior clamped to 0
  })
})

/* -------------------------------- the org ------------------------------- */

/** manager → master (sa) → agent (a) → players p1, p2. */
function tree(): Org {
  const org = createOrg({ name: 'Book', creditLimit: 100_000_000, id: 'mgr' })
  addSubAgent(org, { name: 'Master', creditLimit: 10_000_000, id: 'sa' })
  addAgent(org, 'sa', { name: 'Agent', creditLimit: 2_000_000, id: 'a' })
  addPlayer(org, 'a', { name: 'P1', creditLimit: 1_000_000, id: 'p1' })
  addPlayer(org, 'a', { name: 'P2', creditLimit: 1_000_000, id: 'p2' })
  return org
}

describe('commissionConfigOf — resolves the effective model', () => {
  it('legacy commissionPct reads as profit-share; an explicit model wins; none for players', () => {
    const org = tree()
    setCommissionPct(org, 'a', 30)
    expect(commissionConfigOf(getMember(org, 'a'))).toEqual({ model: 'profit_share', pct: 30 })
    setCommissionModel(org, 'a', { model: 'split', pct: 15 })
    expect(commissionConfigOf(getMember(org, 'a'))).toMatchObject({ model: 'split', pct: 15 })
    expect(commissionConfigOf(getMember(org, 'p1'))).toBeNull()
    expect(commissionConfigOf(getMember(org, 'mgr'))).toBeNull()
  })
})

describe('setCommissionModel — validation + carryover preservation', () => {
  it('rejects non-agents, bad models, and out-of-range percents', () => {
    const org = tree()
    expect(() => setCommissionModel(org, 'p1', { model: 'split', pct: 10 })).toThrow(/agents/)
    expect(() => setCommissionModel(org, 'mgr', { model: 'split', pct: 10 })).toThrow(/agents/)
    // @ts-expect-error — invalid model literal
    expect(() => setCommissionModel(org, 'a', { model: 'nope', pct: 10 })).toThrow(/model/)
    expect(() => setCommissionModel(org, 'a', { model: 'split', pct: 150 })).toThrow(/0–100/)
  })

  it('clearing removes both the model and the legacy pct', () => {
    const org = tree()
    setCommissionModel(org, 'a', { model: 'redline', pct: 25 })
    setCommissionModel(org, 'a', null)
    expect(getMember(org, 'a').commission).toBeUndefined()
    expect(getMember(org, 'a').commissionPct).toBeUndefined()
  })

  it('preserves an existing redline carryover when the rate is edited', () => {
    const org = tree()
    setCommissionModel(org, 'a', { model: 'redline', pct: 25, carryoverCents: -5_000 })
    setCommissionModel(org, 'a', { model: 'redline', pct: 30 }) // no carryover passed
    expect(getMember(org, 'a').commission?.carryoverCents).toBe(-5_000)
  })
})

describe('the legacy rate setter stays consistent with an explicit model', () => {
  it('setCommissionPct adjusts the active model rate (never silently diverges)', () => {
    const org = tree()
    setCommissionModel(org, 'a', { model: 'split', pct: 15 })
    setCommissionPct(org, 'a', 25) // the legacy table edits the rate
    // the model is preserved and the rate moved in lockstep — settlement sees 25%, not 15%
    expect(commissionConfigOf(getMember(org, 'a'))).toMatchObject({ model: 'split', pct: 25 })
  })

  it('setCommissionPct(null) clears both the legacy rate and the explicit model', () => {
    const org = tree()
    setCommissionModel(org, 'a', { model: 'redline', pct: 25, carryoverCents: -3_000 })
    setCommissionPct(org, 'a', null)
    expect(getMember(org, 'a').commission).toBeUndefined()
    expect(getMember(org, 'a').commissionPct).toBeUndefined()
    expect(commissionConfigOf(getMember(org, 'a'))).toBeNull()
  })
})

describe('agentCommission + agentPerformance honour the model', () => {
  it('split can be negative when the roster beats the book; profit-share floors at 0', () => {
    const org = tree()
    getMember(org, 'p1').account.balance = 8_000 // roster up → book down
    setCommissionModel(org, 'a', { model: 'split', pct: 25 })
    expect(agentCommission(org, 'a')).toBe(-2_000) // 25% of the −8,000 figure
    setCommissionModel(org, 'a', { model: 'profit_share', pct: 25 })
    expect(agentCommission(org, 'a')).toBe(0)
    expect(agentPerformance(org, 'a').commissionModel).toBe('profit_share')
  })
})

describe('agentDistribution', () => {
  it('one line per agent carrying a split, graded under their model', () => {
    const org = tree()
    getMember(org, 'p1').account.balance = -12_000 // roster lost 12,000 → book won
    setCommissionModel(org, 'sa', { model: 'split', pct: 10 })
    setCommissionModel(org, 'a', { model: 'redline', pct: 25, carryoverCents: -4_000 })
    const dist = agentDistribution(org)
    const byId = Object.fromEntries(dist.map((d) => [d.agentId, d]))
    expect(byId['sa']).toMatchObject({ model: 'split', commissionCents: 1_200 }) // 10% of 12,000
    // redline: −4,000 + 12,000 = 8,000 surplus → 25% = 2,000, red cleared
    expect(byId['a']).toMatchObject({
      model: 'redline',
      commissionCents: 2_000,
      carryoverBeforeCents: -4_000,
      carryoverAfterCents: 0,
    })
  })
})

describe('settleOrgWeek honours the model + advances redline carryover across weeks', () => {
  it('stamps commission on the statement and never goes past the figure roll-up', () => {
    const org = tree()
    getMember(org, 'p1').account.balance = -10_000 // book won 10,000 off the roster
    setCommissionModel(org, 'sa', { model: 'split', pct: 10 })
    const stmt = settleOrgWeek(org)
    const saLine = stmt.find((s) => s.memberId === 'sa')!
    expect(saLine.commission).toBe(1_000) // 10% of 10,000
    expect(saLine.commissionModel).toBe('split')
    // the manager (no split) carries no commission line, and every figure still zeroed
    expect(stmt.find((s) => s.memberId === 'mgr')!.commission).toBeUndefined()
    for (const m of Object.values(org.members)) expect(m.account.balance).toBe(0)
  })

  it('redline carryover banks, partially clears, then pays — persisted week to week', () => {
    const org = tree()
    setCommissionModel(org, 'a', { model: 'redline', pct: 25 })

    // Week 1: the roster WINS 10,000 (book down) → banks the red, no commission
    getMember(org, 'p1').account.balance = 10_000
    const s1 = settleOrgWeek(org)
    expect(s1.find((s) => s.memberId === 'a')!.commission).toBe(0)
    expect(getMember(org, 'a').commission?.carryoverCents).toBe(-10_000)

    // Week 2: the roster loses 6,000 (book up) → red shrinks to −4,000, still nothing
    getMember(org, 'p1').account.balance = -6_000
    const s2 = settleOrgWeek(org)
    expect(s2.find((s) => s.memberId === 'a')!.commission).toBe(0)
    expect(getMember(org, 'a').commission?.carryoverCents).toBe(-4_000)

    // Week 3: the roster loses 10,000 → clears the red, pays 25% of the 6,000 surplus
    getMember(org, 'p1').account.balance = -10_000
    const s3 = settleOrgWeek(org)
    expect(s3.find((s) => s.memberId === 'a')!.commission).toBe(1_500)
    expect(getMember(org, 'a').commission?.carryoverCents).toBe(0)
  })

  it('a soft close (carryover: true) previews commission but does NOT advance the red figure', () => {
    const org = tree()
    setCommissionModel(org, 'a', { model: 'redline', pct: 25, carryoverCents: -5_000 })
    getMember(org, 'p1').account.balance = 3_000 // roster up → book down
    const stmt = settleOrgWeek(org, { carryover: true })
    expect(stmt.find((s) => s.memberId === 'a')!.commission).toBe(0)
    // nothing collected: the stored red is untouched and figures carry forward
    expect(getMember(org, 'a').commission?.carryoverCents).toBe(-5_000)
    expect(getMember(org, 'p1').account.balance).toBe(3_000)
  })
})
