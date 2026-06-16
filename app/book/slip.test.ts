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
  relatedConflicts,
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

const homeLeg = legFromSelection(ev0, ml(), ml().selections[0])
const awayLeg = legFromSelection(ev0, ml(), ml().selections[1])
const overLeg = legFromSelection(ev0, total(), total().selections[0])
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
