/**
 * The payout/edge config is the product's margin. These tests pin the published multiples,
 * prove every POWER and FLEX row carries a POSITIVE structural house edge, and check the
 * operator tuning helpers. Pure math — no money, no core.
 */
import { describe, it, expect } from 'vitest'
import {
  POWER_TABLE,
  PICK_PROBABILITY,
  MIN_PICKS,
  MAX_PICKS,
  FLEX_MIN_PICKS,
  modeAvailable,
  payoutMultiple,
  topMultiple,
  choose,
  binomial,
  expectedReturn,
  impliedEdge,
  derivePowerTable,
} from './config.js'

describe('choose / binomial', () => {
  it('computes exact binomial coefficients', () => {
    expect(choose(4, 2)).toBe(6)
    expect(choose(6, 3)).toBe(20)
    expect(choose(5, 0)).toBe(1)
    expect(choose(5, 6)).toBe(0)
  })
  it('a fair-coin distribution sums to 1', () => {
    let total = 0
    for (let k = 0; k <= 5; k++) total += binomial(5, k, 0.5)
    expect(total).toBeCloseTo(1, 9)
  })
})

describe('payoutMultiple — POWER', () => {
  it('pays the table only when every leg hits, else 0', () => {
    expect(payoutMultiple('power', 4, 4)).toBe(10)
    expect(payoutMultiple('power', 4, 3)).toBe(0)
    expect(payoutMultiple('power', 2, 2)).toBe(3)
    expect(payoutMultiple('power', 6, 6)).toBe(37.5)
  })
})

describe('payoutMultiple — FLEX', () => {
  it('pays a reduced multiple for a miss, 0 below the lowest tier', () => {
    expect(payoutMultiple('flex', 4, 4)).toBe(5)
    expect(payoutMultiple('flex', 4, 3)).toBe(1.5)
    expect(payoutMultiple('flex', 4, 2)).toBe(0)
    expect(payoutMultiple('flex', 5, 3)).toBe(0.4) // a sub-1 consolation
    expect(payoutMultiple('flex', 6, 6)).toBe(25)
  })
})

describe('modeAvailable', () => {
  it('POWER for 2–6, FLEX only for 3–6', () => {
    expect(modeAvailable('power', 2)).toBe(true)
    expect(modeAvailable('flex', 2)).toBe(false) // below FLEX_MIN_PICKS
    expect(modeAvailable('flex', 3)).toBe(true)
    expect(modeAvailable('power', 7)).toBe(false)
    expect(FLEX_MIN_PICKS).toBe(3)
  })
})

describe('structural house edge — POWER', () => {
  it('every POWER row is house-positive with the documented edge', () => {
    // 1 − 0.5^N × M
    expect(impliedEdge('power', 2)).toBeCloseTo(0.25, 6)
    expect(impliedEdge('power', 3)).toBeCloseTo(0.375, 6)
    expect(impliedEdge('power', 4)).toBeCloseTo(0.375, 6) // the brief's 10x@4 = 37.5%
    expect(impliedEdge('power', 5)).toBeCloseTo(0.375, 6)
    expect(impliedEdge('power', 6)).toBeCloseTo(0.4140625, 6)
  })
  it('the 4-pick fair multiple would be 16x (we pay 10x)', () => {
    expect(1 / PICK_PROBABILITY ** 4).toBe(16)
    expect(POWER_TABLE[4]).toBe(10)
  })
})

describe('structural house edge — FLEX', () => {
  it('every FLEX row is house-positive (EV < 1)', () => {
    for (const picks of [3, 4, 5, 6]) {
      expect(expectedReturn('flex', picks)).toBeLessThan(1)
      expect(impliedEdge('flex', picks)).toBeGreaterThan(0)
    }
  })
  it('matches the documented FLEX edges', () => {
    expect(impliedEdge('flex', 3)).toBeCloseTo(0.25, 4)
    expect(impliedEdge('flex', 4)).toBeCloseTo(0.3125, 4)
    expect(impliedEdge('flex', 5)).toBeCloseTo(0.25, 4)
    expect(impliedEdge('flex', 6)).toBeCloseTo(0.328125, 4)
  })
})

describe('topMultiple + derivePowerTable', () => {
  it('topMultiple is the hit-all multiple', () => {
    expect(topMultiple('power', 4)).toBe(10)
    expect(topMultiple('flex', 5)).toBe(10)
  })
  it('derives a POWER table at a target edge (fair × (1 − edge))', () => {
    const t = derivePowerTable(0.375)
    // 4-pick fair 16 × 0.625 = 10 exactly
    expect(t[4]).toBe(10)
    // 2-pick fair 4 × 0.625 = 2.5
    expect(t[2]).toBe(2.5)
    expect(Object.keys(t).map(Number)).toEqual([2, 3, 4, 5, 6])
  })
  it('a 0% edge derive reproduces the fair 2^N table', () => {
    const t = derivePowerTable(0)
    expect(t[2]).toBe(4)
    expect(t[6]).toBe(64)
  })
  it('respects MIN_PICKS/MAX_PICKS bounds', () => {
    expect(MIN_PICKS).toBe(2)
    expect(MAX_PICKS).toBe(6)
  })
})
