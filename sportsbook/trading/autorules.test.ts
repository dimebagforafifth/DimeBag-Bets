import { describe, it, expect } from 'vitest'
import { evaluateExposureRule, evaluateDriftRule, DEFAULT_AUTORULES } from './autorules.js'

describe('evaluateExposureRule', () => {
  const rule = { enabled: true, maxSideExposureCents: 50_000, moveIncrements: 1 }

  it('does nothing when disabled or balanced', () => {
    expect(evaluateExposureRule({ ...rule, enabled: false }, 90_000, 10_000)).toBeNull()
    expect(evaluateExposureRule(rule, 60_000, 55_000)).toBeNull() // gap 5k ≤ 50k
  })

  it('moves the line toward the light side when one side is overweight', () => {
    // home heavy by 80k > 50k → trim toward away, −0.5 pt
    expect(evaluateExposureRule(rule, 100_000, 20_000)).toEqual({ deltaPoints: -0.5, toward: 'away' })
    // away heavy → +0.5 toward home
    expect(evaluateExposureRule(rule, 10_000, 100_000)).toEqual({ deltaPoints: 0.5, toward: 'home' })
  })
})

describe('evaluateDriftRule', () => {
  const rule = { enabled: true, maxLineMove: 1.5, withinMinutes: 5 }
  const min = (m: number) => m * 60_000

  it('suspends when the source line moves past the threshold within the window', () => {
    const obs = [
      { at: min(0), line: -3.5 },
      { at: min(2), line: -5.5 }, // moved 2 pts in 2 min > 1.5
    ]
    expect(evaluateDriftRule(rule, obs)).toEqual({ suspend: true, movedBy: 2 })
  })

  it('does not suspend a slow move or one outside the window', () => {
    const slow = [
      { at: min(0), line: -3.5 },
      { at: min(2), line: -4.0 }, // only 0.5 pt
    ]
    expect(evaluateDriftRule(rule, slow)?.suspend).toBe(false)
    const outside = [
      { at: min(0), line: -3.5 },
      { at: min(10), line: -5.5 }, // 2 pts but 10 min apart (> 5)
    ]
    expect(evaluateDriftRule(rule, outside)?.suspend).toBe(false)
  })

  it('defaults are disabled (opt-in)', () => {
    expect(DEFAULT_AUTORULES.exposure.enabled).toBe(false)
    expect(DEFAULT_AUTORULES.drift.enabled).toBe(false)
  })
})
