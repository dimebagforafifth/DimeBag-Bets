import { describe, it, expect } from 'vitest'
import {
  boostProfit,
  boostPercentFor,
  boostedReturn,
  freeBetReturn,
  freeBetValue,
  freeBetMultiplier,
} from './boosts.js'

describe('profit boost', () => {
  it('lifts only the profit portion', () => {
    expect(boostProfit(3.0, 0.5)).toBeCloseTo(4.0, 10) // profit 2 → 3 → decimal 4
    expect(boostProfit(2.0, 1.0)).toBeCloseTo(3.0, 10) // profit 1 → 2
    expect(boostProfit(2.5, 0)).toBeCloseTo(2.5, 10) // no boost
  })

  it('boostPercentFor inverts it', () => {
    expect(boostPercentFor(3.0, 4.0)).toBeCloseTo(0.5, 10)
    expect(boostProfit(3.0, boostPercentFor(3.0, 4.0))).toBeCloseTo(4.0, 10)
  })

  it('boostedReturn adds stake back to the boosted profit', () => {
    expect(boostedReturn(1000, 3.0, 0.5)).toBe(4000) // 1000 + 1000×3
  })

  it('rejects bad inputs', () => {
    expect(() => boostProfit(1, 0.5)).toThrow()
    expect(() => boostProfit(3, -0.1)).toThrow()
    expect(() => boostPercentFor(4, 3)).toThrow(/improve/)
  })
})

describe('free / bonus bets', () => {
  it('pays only the profit (stake not returned)', () => {
    expect(freeBetReturn(1000, 3.0)).toBe(2000) // 1000 × (3 − 1)
    expect(freeBetMultiplier(3.0)).toBeCloseTo(2.0, 10)
  })

  it('cash value is profit/decimal of the face stake', () => {
    expect(freeBetValue(1000, 3.0)).toBe(667) // 1000 × 2/3
    expect(freeBetValue(1000, 2.0)).toBe(500) // 1000 × 1/2 — worth half at evens
  })

  it('is worth more on a longshot than a favourite', () => {
    expect(freeBetValue(1000, 11)).toBeGreaterThan(freeBetValue(1000, 1.5))
  })

  it('rejects bad inputs', () => {
    expect(() => freeBetReturn(1000, 1)).toThrow()
    expect(() => freeBetValue(-1, 2)).toThrow()
  })
})
