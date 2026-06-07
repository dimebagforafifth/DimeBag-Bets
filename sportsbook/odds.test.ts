import { describe, it, expect } from 'vitest'
import {
  americanFromDecimal,
  decimalFromAmerican,
  formatAmerican,
  impliedProbability,
  MAX_PARLAY_DECIMAL,
  parlayDecimal,
  potentialReturn,
} from './odds.js'

describe('American ↔ decimal', () => {
  it('converts favourites and underdogs', () => {
    expect(decimalFromAmerican(100)).toBeCloseTo(2)
    expect(decimalFromAmerican(150)).toBeCloseTo(2.5)
    expect(decimalFromAmerican(-110)).toBeCloseTo(1.909, 3)
    expect(decimalFromAmerican(-200)).toBeCloseTo(1.5)
  })

  it('round-trips back to American', () => {
    for (const a of [100, 150, 250, -110, -150, -300]) {
      expect(americanFromDecimal(decimalFromAmerican(a))).toBe(a)
    }
  })

  it('rejects nonsense', () => {
    expect(() => decimalFromAmerican(0)).toThrow()
    expect(() => americanFromDecimal(1)).toThrow()
  })
})

describe('implied probability & formatting', () => {
  it('−110 is about 52.4%', () => {
    expect(impliedProbability(-110)).toBeCloseTo(0.524, 3)
  })
  it('signs the price', () => {
    expect(formatAmerican(150)).toBe('+150')
    expect(formatAmerican(-110)).toBe('−110')
  })
})

describe('parlay pricing', () => {
  it('multiplies the legs', () => {
    // 2.0 × 2.0 × 1.5 = 6.0
    expect(parlayDecimal([100, 100, -200])).toBeCloseTo(6)
  })
  it('caps at the max payout', () => {
    const huge = Array.from({ length: 12 }, () => 500) // 6^12, way over the cap
    expect(parlayDecimal(huge)).toBe(MAX_PARLAY_DECIMAL)
  })
})

describe('potentialReturn', () => {
  it('is stake + rounded profit, to the penny', () => {
    expect(potentialReturn(1000, 2.5)).toBe(2500)
    expect(potentialReturn(1000, 1.909)).toBe(1909)
    expect(potentialReturn(33, 1.909)).toBe(33 + Math.round(33 * 0.909))
  })
})
