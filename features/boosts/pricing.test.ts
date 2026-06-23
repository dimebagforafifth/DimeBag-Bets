/**
 * Boost pricing (pure). The odds-boost uplift is computed with the engine's exact rounding, and
 * the displayed boosted line reconciles to what's actually paid (boostedReturn = baseReturn +
 * uplift), so "prices the improved line" and "pays the improved line" can't drift.
 */

import { describe, expect, it } from 'vitest'
import { boostedQuote, upliftCents } from './pricing.js'

describe('upliftCents', () => {
  it('is pct% of the base, rounded (matching the engine)', () => {
    expect(upliftCents(10_000, 25)).toBe(2_500)
    expect(upliftCents(19_100, 20)).toBe(3_820)
    expect(upliftCents(101, 50)).toBe(51) // round(50.5)
  })
  it('never negative', () => {
    expect(upliftCents(-100, 20)).toBe(0)
    expect(upliftCents(100, -20)).toBe(0)
  })
})

describe('boostedQuote', () => {
  it('improves the line: boostedReturn = baseReturn + uplift, decimal derived from what pays', () => {
    const q = boostedQuote(10_000, 2.0, 20)
    expect(q.baseReturnCents).toBe(20_000) // 10000 × 2.0
    expect(q.upliftCents).toBe(4_000) // 20% of 20000
    expect(q.boostedReturnCents).toBe(24_000) // base + uplift
    expect(q.boostedDecimal).toBeCloseTo(2.4, 9) // 24000 / 10000
    expect(q.boostedReturnCents).toBe(q.baseReturnCents + q.upliftCents)
  })
  it('a 0% boost leaves the line unchanged', () => {
    const q = boostedQuote(5_000, 3.0, 0)
    expect(q.boostedReturnCents).toBe(q.baseReturnCents)
    expect(q.upliftCents).toBe(0)
  })
})
