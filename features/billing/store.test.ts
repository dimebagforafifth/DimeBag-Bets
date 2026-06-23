/** The billing store — persisted config + invoice history, the manager gate, the job wrapper,
 *  status transitions, free-weeks, and the demo seed. Money never moves (FIAT, off-core). */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setViewer } from '../../app/viewer.js'
import {
  __resetBilling,
  __seedBilling,
  generatePeriod,
  getBillingConfig,
  getBillingVersion,
  issuePeriod,
  listPeriods,
  markPeriodPaid,
  setPeriodStatus,
  updateBillingConfig,
  waivePeriod,
} from './store.js'

const week = (n: number) => ({ weekStart: n, weekEnd: n + 1, now: n + 2 })

beforeEach(() => {
  setViewer('mgr', 'manager')
  __resetBilling()
})
afterEach(() => {
  setViewer('mgr', 'manager')
})

describe('config', () => {
  it('updates and bumps the version', () => {
    const v0 = getBillingVersion()
    updateBillingConfig({ baseRateCentsPerHead: 700 })
    expect(getBillingConfig().baseRateCentsPerHead).toBe(700)
    expect(getBillingVersion()).toBeGreaterThan(v0)
  })

  it('validates numeric fields', () => {
    expect(() => updateBillingConfig({ baseRateCentsPerHead: -1 })).toThrow()
    expect(() => updateBillingConfig({ baseRateCentsPerHead: 12.5 })).toThrow()
    expect(() => updateBillingConfig({ cryptoDiscountBps: 20_000 })).toThrow()
    expect(() =>
      updateBillingConfig({ activeDefinition: { kind: 'settled-wager', minSettledWagers: 0 } }),
    ).toThrow()
  })

  it('is manager-gated', () => {
    setViewer('a-1', 'agent')
    expect(() => updateBillingConfig({ baseRateCentsPerHead: 800 })).toThrow(/manager/)
  })
})

describe('generate + transitions', () => {
  it('generates a persisted draft invoice (moves no money)', () => {
    expect(listPeriods()).toHaveLength(0)
    const inv = generatePeriod(week(10))
    expect(inv.id).toMatch(/^inv-/)
    expect(inv.status).toBe('draft')
    expect(listPeriods()).toHaveLength(1)
    expect(typeof inv.activeHeadCount).toBe('number')
  })

  it('walks draft → issued → paid, stamping the times', () => {
    const inv = generatePeriod(week(20))
    const issued = issuePeriod(inv.id, 100)
    expect(issued.status).toBe('issued')
    expect(issued.issuedAt).toBe(100)
    const paid = markPeriodPaid(inv.id, 200)
    expect(paid.status).toBe('paid')
    expect(paid.paidAt).toBe(200)
  })

  it('can waive an invoice', () => {
    const inv = generatePeriod(week(30))
    expect(waivePeriod(inv.id, 5).status).toBe('waived')
  })

  it('transitions are manager-gated', () => {
    const inv = generatePeriod(week(40))
    setViewer('a-1', 'agent')
    expect(() => setPeriodStatus(inv.id, 'paid', 1)).toThrow(/manager/)
    expect(() => generatePeriod(week(41))).toThrow(/manager/)
  })

  it('the first N periods are free (waived) per config.freeWeeks', () => {
    updateBillingConfig({ freeWeeks: 2 })
    expect(generatePeriod(week(50)).status).toBe('waived')
    expect(generatePeriod(week(60)).status).toBe('waived')
    expect(generatePeriod(week(70)).status).toBe('draft') // 3rd week bills normally
  })
})

describe('seed', () => {
  it('seeds historical invoices when empty (records only, no money)', () => {
    expect(listPeriods()).toHaveLength(0)
    __seedBilling(1_700_000_000_000)
    const periods = listPeriods()
    expect(periods.length).toBeGreaterThan(0)
    // all-FIAT records, none in a money-bearing core path
    expect(periods.every((p) => p.currency === 'USD')).toBe(true)
    expect(periods.every((p) => p.seeded === true)).toBe(true)
  })

  it('seeded demo invoices never collide with a generated invoice id (seq desync regression)', () => {
    __seedBilling(1_700_000_000_000) // advances seq past the seeded rows
    const inv = generatePeriod(week(80))
    const ids = listPeriods().map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length) // every id is unique
    expect(ids).toContain(inv.id)
  })

  it('seeded demo invoices do not consume the free-week allotment', () => {
    updateBillingConfig({ freeWeeks: 2 })
    __seedBilling(1_700_000_000_000) // 3 seeded periods now exist
    expect(generatePeriod(week(90)).status).toBe('waived')
    expect(generatePeriod(week(100)).status).toBe('waived')
    expect(generatePeriod(week(110)).status).toBe('draft') // exactly 2 free weeks delivered
  })
})

describe('free-week accounting', () => {
  it('seasonal-pause weeks do not draw down the onboarding free-week grant', () => {
    updateBillingConfig({ freeWeeks: 2, seasonalPause: true })
    // paused weeks are waived for the pause, NOT as free weeks…
    expect(generatePeriod(week(200)).waivedReason).toBe('seasonal-pause')
    expect(generatePeriod(week(210)).waivedReason).toBe('seasonal-pause')
    expect(generatePeriod(week(220)).waivedReason).toBe('seasonal-pause')
    // …so when the season resumes the 2 free weeks are still intact
    updateBillingConfig({ seasonalPause: false })
    expect(generatePeriod(week(230)).waivedReason).toBe('free-week')
    expect(generatePeriod(week(240)).waivedReason).toBe('free-week')
    expect(generatePeriod(week(250)).status).toBe('draft')
  })
})
