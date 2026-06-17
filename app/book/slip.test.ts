/**
 * The slip model — parlay pricing off the LOCKED priceDisplay decimals, same-game
 * detection, the singles-vs-parlay quote, related-contingency blocking, and the
 * price-moved (re-confirm) check. Credits/cents only.
 */
import { describe, it, expect } from 'vitest'
import { mockSlate } from './mockBook.js'
import {
  legFromSelection,
  isSameGame,
  parlayPrice,
  sgpPrice,
  combinedDecimal,
  relatedConflicts,
  contradictoryLegs,
  movedLegKeys,
  slipQuote,
  pickLabel,
} from './slip.js'
import { parlayDecimal } from './odds-format.js'

const slate = mockSlate()
const ev0 = slate[0]
const ev1 = slate[1]
const ml = (e = ev0) => e.markets.find((m) => m.type === 'moneyline')!
const total = (e = ev0) => e.markets.find((m) => m.type === 'total')!
const altTotal = (e = ev0) => e.markets.find((m) => m.marketId.endsWith('-tot-alt'))!

const homeLeg = legFromSelection(ev0, ml(), ml().selections[0])
const awayLeg = legFromSelection(ev0, ml(), ml().selections[1])
const overLeg = legFromSelection(ev0, total(), total().selections[0])
const underLeg = legFromSelection(ev0, total(), total().selections[1])
const otherGameLeg = legFromSelection(ev1, ml(ev1), ml(ev1).selections[0])

describe('slip — pricing + parlay', () => {
  it('a single-leg quote returns the leg decimal and its return', () => {
    const q = slipQuote([homeLeg], 'single', 10_000)
    expect(q.totalStakeCents).toBe(10_000)
    expect(q.decimal).toBe(homeLeg.price.decimal)
    expect(q.toReturnCents).toBe(Math.round(10_000 * homeLeg.price.decimal))
  })

  it('a parlay multiplies the leg decimals (capped)', () => {
    const q = slipQuote([homeLeg, otherGameLeg], 'parlay', 5_000)
    const expected = parlayDecimal([homeLeg.price.decimal, otherGameLeg.price.decimal])
    expect(parlayPrice([homeLeg, otherGameLeg])).toBe(expected)
    expect(q.decimal).toBe(expected)
    expect(q.totalStakeCents).toBe(5_000)
    expect(q.toReturnCents).toBe(Math.round(5_000 * expected))
  })

  it('singles mode stakes each leg separately', () => {
    const q = slipQuote([homeLeg, otherGameLeg], 'single', 4_000)
    expect(q.totalStakeCents).toBe(8_000) // 4,000 × 2
    expect(q.toReturnCents).toBe(
      Math.round(4_000 * homeLeg.price.decimal) + Math.round(4_000 * otherGameLeg.price.decimal),
    )
  })

  it('detects a same-game parlay', () => {
    expect(isSameGame([homeLeg, overLeg])).toBe(true) // both on ev0
    expect(isSameGame([homeLeg, otherGameLeg])).toBe(false)
    expect(isSameGame([homeLeg])).toBe(false) // one leg isn't a parlay
  })

  it('flags related-contingency legs (same market, same event)', () => {
    // home + away of the SAME moneyline can't be parlayed
    expect(relatedConflicts([homeLeg, awayLeg]).sort()).toEqual([awayLeg.key, homeLeg.key].sort())
    // different markets on the same game are fine
    expect(relatedConflicts([homeLeg, overLeg])).toEqual([])
  })
})

describe('slip — correlated same-game parlay (SGP)', () => {
  it('legFromSelection locks a de-vigged true probability and the sport', () => {
    expect(homeLeg.sport).toBe(ev0.sport)
    expect(homeLeg.trueProb).toBeGreaterThan(0)
    expect(homeLeg.trueProb).toBeLessThan(1)
    // the two moneyline sides' true probs de-vig to ~1
    expect((homeLeg.trueProb ?? 0) + (awayLeg.trueProb ?? 0)).toBeCloseTo(1, 6)
  })

  it('prices a same-game parlay with correlation, never longer than independent', () => {
    expect(isSameGame([homeLeg, overLeg])).toBe(true)
    const combined = combinedDecimal([homeLeg, overLeg])
    expect(combined.sgp).toBe(true)
    expect(combined.decimal).toBe(sgpPrice([homeLeg, overLeg]))
    // correlation can only shorten: SGP ≤ the naive independent product (4dp granularity)
    expect(combined.decimal).toBeLessThanOrEqual(parlayPrice([homeLeg, overLeg]) + 1e-3)
  })

  it('a cross-game parlay stays on the independent product (no SGP)', () => {
    const combined = combinedDecimal([homeLeg, otherGameLeg])
    expect(combined.sgp).toBe(false)
    expect(combined.decimal).toBe(parlayPrice([homeLeg, otherGameLeg]))
  })

  it('slipQuote uses the SGP price for a same-game parlay', () => {
    const q = slipQuote([homeLeg, overLeg], 'parlay', 5_000)
    expect(q.decimal).toBe(sgpPrice([homeLeg, overLeg]))
  })

  it('flags contradictory legs: over + under on the same total across alt lines', () => {
    const altUnder = legFromSelection(ev0, altTotal(), altTotal().selections[1]) // an under
    // different markets (main vs alt) so relatedConflicts misses it…
    expect(relatedConflicts([overLeg, altUnder])).toEqual([])
    // …but it's the same total family with opposing sides → contradictory
    expect(contradictoryLegs([overLeg, altUnder]).sort()).toEqual(
      [altUnder.key, overLeg.key].sort(),
    )
  })

  it('flags over + under on the very same prop/total as contradictory', () => {
    expect(contradictoryLegs([overLeg, underLeg]).sort()).toEqual(
      [overLeg.key, underLeg.key].sort(),
    )
    // independent markets are not contradictory
    expect(contradictoryLegs([homeLeg, overLeg])).toEqual([])
  })
})

describe('slip — labels + price moves', () => {
  it('builds readable pick labels per market type', () => {
    expect(pickLabel(ev0, ml(), ml().selections[0])).toBe(ev0.home)
    const tot = total()
    expect(pickLabel(ev0, tot, tot.selections[0])).toMatch(/^Over /)
  })

  it('flags a leg whose displayed price has moved since it was added', () => {
    // no move against the same slate
    expect(movedLegKeys([homeLeg], slate)).toEqual([])
    // simulate a line move: rebuild the slate with a changed price on that selection
    const moved = mockSlate()
    const sel = moved[0].markets.find((m) => m.type === 'moneyline')!.selections[0]
    sel.priceDisplay = {
      american: sel.priceDisplay.american - 40,
      decimal: sel.priceDisplay.decimal - 0.2,
    }
    expect(movedLegKeys([homeLeg], moved)).toEqual([homeLeg.key])
  })
})
