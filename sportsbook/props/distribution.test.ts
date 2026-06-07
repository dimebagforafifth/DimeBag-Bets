import { describe, it, expect } from 'vitest'
import { normalCdf, normalSf } from './distribution.js'

describe('normalCdf', () => {
  it('matches known standard-normal values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1)).toBeCloseTo(0.8413447, 5)
    expect(normalCdf(-1)).toBeCloseTo(0.1586553, 5)
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 4) // the 97.5% z
    expect(normalCdf(1.644854)).toBeCloseTo(0.95, 4)
    expect(normalCdf(-2)).toBeCloseTo(0.0227501, 5)
  })

  it('shifts and scales with mean/sd', () => {
    expect(normalCdf(110, 100, 10)).toBeCloseTo(0.8413447, 5) // 1 sd above
    expect(normalCdf(100, 100, 10)).toBeCloseTo(0.5, 6)
  })

  it('is symmetric: cdf(x) + cdf(−x) = 1', () => {
    for (const x of [0.3, 1.1, 2.4]) {
      expect(normalCdf(x) + normalCdf(-x)).toBeCloseTo(1, 6)
    }
  })

  it('normalSf is 1 − cdf', () => {
    expect(normalSf(1)).toBeCloseTo(1 - normalCdf(1), 10)
    expect(normalSf(0)).toBeCloseTo(0.5, 6)
  })

  it('rejects a non-positive sd', () => {
    expect(() => normalCdf(0, 0, 0)).toThrow()
  })
})
