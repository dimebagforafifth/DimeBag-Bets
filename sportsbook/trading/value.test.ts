import { describe, it, expect } from 'vitest'
import {
  expectedValue,
  edge,
  isValueBet,
  breakEvenProbability,
  kellyFraction,
  kellyStake,
  closingLineValue,
} from './value.js'

describe('expectedValue', () => {
  it('is zero at a fair price (decimal = 1/p)', () => {
    expect(expectedValue(0.5, 2)).toBeCloseTo(0, 10)
    expect(expectedValue(0.25, 4)).toBeCloseTo(0, 10)
  })

  it('is positive on a value price, negative on a short one', () => {
    expect(expectedValue(0.6, 2)).toBeCloseTo(0.2, 10) // p·d − 1 = 1.2 − 1
    expect(expectedValue(0.55, 2)).toBeCloseTo(0.1, 10)
    expect(expectedValue(0.45, 2)).toBeCloseTo(-0.1, 10)
  })

  it('edge is an alias of expectedValue; isValueBet tracks its sign', () => {
    expect(edge(0.55, 2)).toBeCloseTo(expectedValue(0.55, 2), 12)
    expect(isValueBet(0.55, 2)).toBe(true)
    expect(isValueBet(0.5, 2)).toBe(false)
    expect(isValueBet(0.45, 2)).toBe(false)
  })

  it('rejects bad inputs', () => {
    expect(() => expectedValue(0, 2)).toThrow()
    expect(() => expectedValue(0.5, 1)).toThrow()
  })
})

describe('breakEvenProbability', () => {
  it('is 1 / decimal', () => {
    expect(breakEvenProbability(2)).toBeCloseTo(0.5, 10)
    expect(breakEvenProbability(4)).toBeCloseTo(0.25, 10)
    expect(breakEvenProbability(1.5)).toBeCloseTo(1 / 1.5, 10)
  })
})

describe('kellyFraction / kellyStake', () => {
  it('matches the textbook value (p=0.55, d=2 → 10% of bankroll)', () => {
    expect(kellyFraction(0.55, 2)).toBeCloseTo(0.1, 10)
    expect(kellyStake(0.55, 2, 1000)).toBeCloseTo(100, 6)
  })

  it('equals EV / (decimal − 1)', () => {
    const p = 0.6
    const d = 2.5
    expect(kellyFraction(p, d)).toBeCloseTo(expectedValue(p, d) / (d - 1), 10)
  })

  it('stakes nothing on a fair or −EV edge', () => {
    expect(kellyFraction(0.5, 2)).toBe(0)
    expect(kellyFraction(0.4, 2)).toBe(0)
    expect(kellyStake(0.4, 2, 1000)).toBe(0)
  })

  it('fractional Kelly scales the fraction', () => {
    expect(kellyFraction(0.55, 2, 0.5)).toBeCloseTo(0.05, 10)
    expect(kellyStake(0.55, 2, 1000, 0.5)).toBeCloseTo(50, 6)
  })

  it('rejects a negative multiplier or bankroll', () => {
    expect(() => kellyFraction(0.55, 2, -1)).toThrow()
    expect(() => kellyStake(0.55, 2, -10)).toThrow()
  })
})

describe('closingLineValue', () => {
  it('is positive when the bet price beats the closing fair price', () => {
    // closing fair prob 0.5 (fair decimal 2.0); we bet at 2.1 → CLV +0.05
    expect(closingLineValue(2.1, 0.5)).toBeCloseTo(0.05, 10)
    expect(closingLineValue(1.9, 0.5)).toBeCloseTo(-0.05, 10)
    expect(closingLineValue(2.0, 0.5)).toBeCloseTo(0, 10)
  })
})
