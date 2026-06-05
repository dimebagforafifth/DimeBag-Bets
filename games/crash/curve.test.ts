import { describe, it, expect } from 'vitest'
import { GROWTH_PER_SECOND, multiplierAt, elapsedForMultiplier } from './curve.js'

describe('multiplierAt', () => {
  it('starts at 1.00× and rises monotonically', () => {
    expect(multiplierAt(0)).toBe(1)
    let prev = 0
    for (let ms = 0; ms <= 10_000; ms += 250) {
      const m = multiplierAt(ms)
      expect(m).toBeGreaterThanOrEqual(prev)
      prev = m
    }
  })

  it('never dips below 1.00× for non-positive time', () => {
    expect(multiplierAt(-500)).toBe(1)
  })

  it('follows the exponential curve e^(rate·t)', () => {
    const seconds = 5
    const expected = Math.floor(Math.exp(GROWTH_PER_SECOND * seconds) * 100) / 100
    expect(multiplierAt(seconds * 1000)).toBe(expected)
  })
})

describe('elapsedForMultiplier (inverse)', () => {
  it('round-trips with multiplierAt', () => {
    for (const m of [1.5, 2, 5, 10]) {
      const ms = elapsedForMultiplier(m)
      // at that instant the curve shows at least m (floor may shave a hair)
      expect(multiplierAt(ms)).toBeGreaterThanOrEqual(m - 0.01)
    }
  })

  it('is 0 at or below 1.00×', () => {
    expect(elapsedForMultiplier(1)).toBe(0)
    expect(elapsedForMultiplier(0.5)).toBe(0)
  })
})
