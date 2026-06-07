import { describe, it, expect } from 'vitest'
import { arbitrage, marketSafety } from './arbitrage.js'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('arbitrage', () => {
  it('a margined market is not an arb', () => {
    const r = arbitrage([1.9, 1.9]) // overround ~1.0526
    expect(r.isArbitrage).toBe(false)
    expect(r.overround).toBeCloseTo(1 / 1.9 + 1 / 1.9, 10)
    expect(r.profitMargin).toBeLessThan(0)
  })

  it('a perfectly fair market sits exactly on the line', () => {
    const r = arbitrage([1.5, 3.0]) // implied 0.6667 + 0.3333 = 1.0
    expect(r.overround).toBeCloseTo(1, 10)
    expect(r.isArbitrage).toBe(false)
    expect(r.profitMargin).toBeCloseTo(0, 10)
  })

  it('detects a two-way arb and sizes the guaranteed-return hedge', () => {
    const r = arbitrage([2.1, 2.1]) // overround = 2/2.1 = 0.95238
    expect(r.isArbitrage).toBe(true)
    expect(r.returnMultiple).toBeCloseTo(1.05, 6) // 1 / 0.95238
    expect(r.profitMargin).toBeCloseTo(0.05, 6)
    expect(r.stakeFractions).toEqual([0.5, 0.5])
    // staking the fractions returns the same multiple whoever wins
    r.stakeFractions.forEach((f, i) => expect(f * [2.1, 2.1][i]).toBeCloseTo(r.returnMultiple, 6))
  })

  it('detects a three-way arb', () => {
    const r = arbitrage([3.5, 3.5, 3.5]) // overround = 3/3.5 = 0.857
    expect(r.isArbitrage).toBe(true)
    expect(sum(r.stakeFractions)).toBeCloseTo(1, 10)
    r.stakeFractions.forEach((f, i) => expect(f * [3.5, 3.5, 3.5][i]).toBeCloseTo(r.returnMultiple, 6))
  })
})

describe('marketSafety', () => {
  it('a margined, non-arbable market is safe (no fair probs given)', () => {
    const s = marketSafety([1.9, 1.95])
    expect(s.arbable).toBe(false)
    expect(s.safe).toBe(true)
    expect(s.valueOutcomes).toEqual([])
  })

  it('flags an arbable market as unsafe', () => {
    const s = marketSafety([2.1, 2.1])
    expect(s.arbable).toBe(true)
    expect(s.safe).toBe(false)
  })

  it('flags an outcome the book is offering at +EV against its own fair probs', () => {
    // book thinks it's 50/50 but posts 2.1 on side 0 → +EV leak there
    const s = marketSafety([2.1, 1.8], [0.5, 0.5])
    expect(s.valueOutcomes).toEqual([0])
    expect(s.safe).toBe(false)
  })

  it('is safe when every outcome is priced at or below fair', () => {
    const s = marketSafety([1.9, 1.9], [0.5, 0.5]) // each pays 1.9 < fair 2.0
    expect(s.valueOutcomes).toEqual([])
    expect(s.safe).toBe(true)
  })

  it('rejects a mismatched fair-probs length', () => {
    expect(() => marketSafety([2, 2, 2], [0.5, 0.5])).toThrow(/one fair probability/)
  })
})
