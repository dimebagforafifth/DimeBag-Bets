import { describe, it, expect } from 'vitest'
import {
  probabilityFromDecimal,
  decimalFromProbability,
  americanFromProbability,
  decimalFromFractional,
  fractionalFromDecimal,
} from './convert.js'

describe('probability ↔ decimal', () => {
  it('1/decimal and its inverse', () => {
    expect(probabilityFromDecimal(2)).toBeCloseTo(0.5, 10)
    expect(probabilityFromDecimal(4)).toBeCloseTo(0.25, 10)
    expect(decimalFromProbability(0.5)).toBeCloseTo(2, 10)
    expect(decimalFromProbability(0.25)).toBeCloseTo(4, 10)
  })

  it('round-trips', () => {
    for (const d of [1.5, 1.91, 2.5, 5, 11]) {
      expect(decimalFromProbability(probabilityFromDecimal(d))).toBeCloseTo(d, 10)
    }
  })

  it('rejects out-of-range inputs', () => {
    expect(() => probabilityFromDecimal(1)).toThrow()
    expect(() => decimalFromProbability(0)).toThrow()
    expect(() => decimalFromProbability(1)).toThrow()
  })
})

describe('americanFromProbability', () => {
  it('an even-money 50% is +100', () => {
    expect(americanFromProbability(0.5)).toBe(100)
  })
  it('a strong favourite is a big negative price', () => {
    // p = 0.8 → decimal 1.25 → −400
    expect(americanFromProbability(0.8)).toBe(-400)
  })
})

describe('fractional ↔ decimal', () => {
  it('a/b → 1 + a/b', () => {
    expect(decimalFromFractional(3, 2)).toBeCloseTo(2.5, 10)
    expect(decimalFromFractional(1, 1)).toBeCloseTo(2, 10)
    expect(decimalFromFractional(5, 1)).toBeCloseTo(6, 10)
  })

  it('decimal → reduced fraction', () => {
    expect(fractionalFromDecimal(2.5)).toEqual([3, 2])
    expect(fractionalFromDecimal(2)).toEqual([1, 1])
    expect(fractionalFromDecimal(6)).toEqual([5, 1])
    expect(fractionalFromDecimal(1.2)).toEqual([1, 5]) // 0.2 = 1/5
  })

  it('round-trips a/b → decimal → a/b in lowest terms', () => {
    expect(fractionalFromDecimal(decimalFromFractional(6, 4))).toEqual([3, 2])
  })

  it('rejects bad inputs', () => {
    expect(() => decimalFromFractional(0, 1)).toThrow()
    expect(() => fractionalFromDecimal(1)).toThrow()
  })

  it('a heavy favourite (tiny profit) gives the closest fraction, not [1,1]', () => {
    // decimal 1.0001 → profit 0.0001; best within den ≤ 1000 is 1/1000, NOT 1/1.
    const [num, den] = fractionalFromDecimal(1.0001)
    expect([num, den]).not.toEqual([1, 1])
    expect(1 + num / den).toBeLessThan(1.01) // reconstructs near 1, not 2.0
    // 1.05 round-trips cleanly to 1/20
    expect(fractionalFromDecimal(1.05)).toEqual([1, 20])
  })
})
