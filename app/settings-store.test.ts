import { describe, it, expect } from 'vitest'
import {
  getRiskThresholds,
  getSettings,
  isGameEnabled,
  isSettlementDue,
  markSettled,
  setDefaultCreditLimit,
  setGameEnabled,
  setRiskCreditUtil,
  setRiskExposureCap,
  setSettlementPeriodDays,
  settlementDueAt,
} from './settings-store.js'

// The store is a live singleton (memory-backed outside the browser), so these run
// in declared order and build on each other.
describe('book settings store', () => {
  it('ships sensible defaults: weekly, a starter credit line, all games on', () => {
    const s = getSettings()
    expect(s.settlementPeriodDays).toBe(7)
    expect(s.defaultCreditLimit).toBe(20_000)
    expect(isGameEnabled('mines')).toBe(true)
    expect(s.lastSettledAt).toBe(0)
  })

  it('disables and re-enables a game (absent ⇒ enabled)', () => {
    setGameEnabled('keno', false)
    expect(isGameEnabled('keno')).toBe(false)
    expect(getSettings().disabledGames.keno).toBe(true)
    setGameEnabled('keno', true)
    expect(isGameEnabled('keno')).toBe(true)
    expect(getSettings().disabledGames.keno).toBeUndefined()
  })

  it('validates the settlement period and default credit', () => {
    setSettlementPeriodDays(14)
    expect(getSettings().settlementPeriodDays).toBe(14)
    expect(() => setSettlementPeriodDays(0)).toThrow(/≥ 1/)
    setDefaultCreditLimit(50_000)
    expect(getSettings().defaultCreditLimit).toBe(50_000)
    expect(() => setDefaultCreditLimit(-1)).toThrow(/≥ 0/)
  })

  it('sets + validates the risk thresholds', () => {
    expect(getRiskThresholds()).toEqual({ creditUtil: 0.8, exposureCap: null }) // ship defaults
    setRiskCreditUtil(0.5)
    expect(getRiskThresholds().creditUtil).toBe(0.5)
    expect(() => setRiskCreditUtil(0)).toThrow(/\(0, 1]/)
    expect(() => setRiskCreditUtil(1.5)).toThrow(/\(0, 1]/)
    setRiskExposureCap(250_000)
    expect(getRiskThresholds().exposureCap).toBe(250_000)
    setRiskExposureCap(null)
    expect(getRiskThresholds().exposureCap).toBeNull()
    expect(() => setRiskExposureCap(-1)).toThrow(/≥ 0/)
  })

  it('tracks the settlement due-date off the cadence + last settle', () => {
    expect(settlementDueAt()).toBe(0) // never settled → no anchor yet
    expect(isSettlementDue(Date.now())).toBe(false)
    const t = 1_000_000_000_000
    setSettlementPeriodDays(7)
    markSettled(t)
    const day = 24 * 60 * 60 * 1000
    expect(settlementDueAt()).toBe(t + 7 * day)
    expect(isSettlementDue(t + 6 * day)).toBe(false) // not yet
    expect(isSettlementDue(t + 7 * day)).toBe(true) // due
  })
})
