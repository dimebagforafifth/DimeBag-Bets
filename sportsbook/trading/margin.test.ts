import { describe, it, expect } from 'vitest'
import {
  overround,
  bookMargin,
  theoreticalHold,
  devigProportional,
  devigPower,
  devigShin,
  fairProbabilities,
  fairDecimalOdds,
  overroundAmerican,
  bookMarginAmerican,
  marketReport,
} from './margin.js'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('overround / margin / hold', () => {
  it('a perfectly fair two-way (2.0 / 2.0) has zero margin', () => {
    expect(overround([2, 2])).toBeCloseTo(1, 10)
    expect(bookMargin([2, 2])).toBeCloseTo(0, 10)
    expect(theoreticalHold([2, 2])).toBeCloseTo(0, 10)
  })

  it('a −110 / −110 market carries ~4.76% overround', () => {
    // −110 → decimal 1 + 100/110 = 1.90909…, implied 0.5238 each
    expect(overroundAmerican([-110, -110])).toBeCloseTo(1.047619, 5)
    expect(bookMarginAmerican([-110, -110])).toBeCloseTo(0.047619, 5)
    expect(theoreticalHold([1 + 100 / 110, 1 + 100 / 110])).toBeCloseTo(1 - 1 / 1.047619, 5)
  })

  it('rejects degenerate markets', () => {
    expect(() => overround([2])).toThrow(/≥2/)
    expect(() => overround([2, 1])).toThrow(/> 1/)
  })
})

describe('devig — every method sums to 1', () => {
  const markets = [
    [2, 2],
    [1 + 100 / 110, 1 + 100 / 110], // −110 / −110
    [1.4, 3.0], // vigged, asymmetric
    [1.25, 6.5, 9.0], // 3-way with vig
  ]
  for (const m of markets) {
    for (const method of ['proportional', 'power', 'shin'] as const) {
      it(`${method} on [${m.map((x) => x.toFixed(2))}] sums to 1`, () => {
        const p = fairProbabilities(m, method)
        expect(sum(p)).toBeCloseTo(1, 6)
        for (const pi of p) expect(pi).toBeGreaterThan(0)
        for (const pi of p) expect(pi).toBeLessThan(1)
      })
    }
  }

  it('a fair market is an identity for every method', () => {
    // 1.5 / 3.0 has implied 0.6667 + 0.3333 = 1.0 (no vig)
    for (const method of ['proportional', 'power', 'shin'] as const) {
      const p = fairProbabilities([1.5, 3.0], method)
      expect(p[0]).toBeCloseTo(2 / 3, 4)
      expect(p[1]).toBeCloseTo(1 / 3, 4)
    }
  })

  it('proportional devig of −110/−110 is 50/50', () => {
    const p = devigProportional([1 + 100 / 110, 1 + 100 / 110])
    expect(p[0]).toBeCloseTo(0.5, 10)
    expect(p[1]).toBeCloseTo(0.5, 10)
  })

  it('Shin is symmetric on a symmetric market', () => {
    const p = devigShin([1.9, 1.9])
    expect(p[0]).toBeCloseTo(0.5, 8)
    expect(p[1]).toBeCloseTo(0.5, 8)
  })

  it('power devig removes vig (Σ qᵏ = 1 at the solved k)', () => {
    const decimals = [1.4, 3.0]
    const p = devigPower(decimals)
    expect(sum(p)).toBeCloseTo(1, 8)
    // favourite stays the favourite
    expect(p[0]).toBeGreaterThan(p[1])
  })

  it('methods genuinely differ on an asymmetric vigged market', () => {
    const m = [1.4, 3.0]
    const prop = devigProportional(m)[0]
    const pow = devigPower(m)[0]
    const shin = devigShin(m)[0]
    expect(Math.abs(prop - pow)).toBeGreaterThan(1e-4)
    expect(Math.abs(prop - shin)).toBeGreaterThan(1e-4)
  })
})

describe('fairDecimalOdds & marketReport', () => {
  it('fair odds are 1 / fair prob', () => {
    const m = [1.4, 3.0]
    const probs = fairProbabilities(m, 'proportional')
    const odds = fairDecimalOdds(m, 'proportional')
    odds.forEach((o, i) => expect(o).toBeCloseTo(1 / probs[i], 8))
  })

  it('the report ties the numbers together', () => {
    const m = [1.4, 3.0]
    const r = marketReport(m)
    expect(r.overround).toBeCloseTo(overround(m), 10)
    expect(r.margin).toBeCloseTo(overround(m) - 1, 10)
    expect(sum(r.fairProbabilities)).toBeCloseTo(1, 8)
    expect(r.fairDecimals[0]).toBeCloseTo(1 / r.fairProbabilities[0], 8)
  })
})
