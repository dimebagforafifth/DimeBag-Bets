import { describe, it, expect } from 'vitest'
import { makePrices, twoWayPrices, postedImpliedProbabilities, pricedOverround } from './pricing.js'
import { devigProportional, overround } from './margin.js'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('postedImpliedProbabilities — overround lands on the target', () => {
  const fair = [0.6, 0.4]
  for (const method of ['proportional', 'additive', 'power'] as const) {
    it(`${method} hits 1 + margin`, () => {
      const q = postedImpliedProbabilities(fair, 0.05, method)
      expect(sum(q)).toBeCloseTo(1.05, 6)
    })
  }

  it('proportional scales each fair prob by (1 + margin)', () => {
    const q = postedImpliedProbabilities([0.6, 0.4], 0.05, 'proportional')
    expect(q[0]).toBeCloseTo(0.63, 10)
    expect(q[1]).toBeCloseTo(0.42, 10)
  })

  it('additive adds margin/n to each', () => {
    const q = postedImpliedProbabilities([0.6, 0.4], 0.06, 'additive')
    expect(q[0]).toBeCloseTo(0.63, 10) // 0.6 + 0.03
    expect(q[1]).toBeCloseTo(0.43, 10) // 0.4 + 0.03
  })

  it('rejects a negative margin and a non-normalised input', () => {
    expect(() => postedImpliedProbabilities([0.6, 0.4], -0.01)).toThrow(/≥ 0/)
    expect(() => postedImpliedProbabilities([0.6, 0.6], 0.05)).toThrow(/sum/)
  })
})

describe('makePrices', () => {
  it('returns decimals = 1 / posted implied, with the target overround', () => {
    const priced = makePrices([0.6, 0.4], 0.05, 'proportional')
    expect(pricedOverround(priced)).toBeCloseTo(1.05, 6)
    priced.forEach((o) => expect(o.decimal).toBeCloseTo(1 / o.impliedProbability, 10))
    expect(priced[0].decimal).toBeCloseTo(1 / 0.63, 8)
  })

  it('carries an american price for each outcome', () => {
    const priced = makePrices([0.5, 0.5], 0.04, 'proportional')
    // 0.52 implied → decimal 1.923 → about −108
    expect(priced[0].american).toBeLessThan(0)
    expect(priced[1].american).toBeLessThan(0)
  })

  it('proportional make-prices is the inverse of proportional devig', () => {
    const fair = [0.62, 0.38]
    const priced = makePrices(fair, 0.05, 'proportional')
    const recovered = devigProportional(priced.map((o) => o.decimal))
    expect(recovered[0]).toBeCloseTo(fair[0], 8)
    expect(recovered[1]).toBeCloseTo(fair[1], 8)
  })

  it('power loads more margin onto the longshot than proportional', () => {
    const fair = [0.75, 0.25]
    const prop = makePrices(fair, 0.06, 'proportional')
    const pow = makePrices(fair, 0.06, 'power')
    // both hit the same overround…
    expect(pricedOverround(prop)).toBeCloseTo(pricedOverround(pow), 5)
    // …but power posts a shorter (lower decimal) longshot price
    expect(pow[1].decimal).toBeLessThan(prop[1].decimal)
  })
})

describe('twoWayPrices', () => {
  it('prices a home/away market from the home probability', () => {
    const [home, away] = twoWayPrices(0.55, 0.05, 'proportional')
    expect(home.fairProbability).toBeCloseTo(0.55, 10)
    expect(away.fairProbability).toBeCloseTo(0.45, 10)
    expect(home.impliedProbability + away.impliedProbability).toBeCloseTo(1.05, 6)
    expect(home.decimal).toBeLessThan(away.decimal) // favourite is the shorter price
  })

  it('an even market with margin gives two equal short prices', () => {
    const [home, away] = twoWayPrices(0.5, 0.05)
    expect(home.decimal).toBeCloseTo(away.decimal, 10)
    expect(overround([home.decimal, away.decimal])).toBeCloseTo(1.05, 6)
  })
})
