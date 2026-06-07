import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EVENTS, gradeSelection, type GameEvent } from '../markets.js'
import { decimalFromAmerican } from '../odds.js'
import {
  applyOverlay,
  getAdjustment,
  isMarketAdjusted,
  isMarketSuspended,
  nudgeLine,
  resetMarket,
  resetOverlay,
  setEventSuspended,
  setMargin,
  setMarketSuspended,
} from './overlay.js'

/** A fresh all-upcoming slate (clone so we never mutate the EVENTS fixture). */
function slate(): GameEvent[] {
  return EVENTS.map((e) => ({ ...e, status: 'upcoming' as const, selections: e.selections.map((s) => ({ ...s })) }))
}
const EV = 'nba-lal-bos' // Lakers (home) −3.5, total 224.5, ML −135 / +115
function ev(events: GameEvent[], id = EV) {
  return events.find((e) => e.id === id)!
}
function pick(e: GameEvent, suffix: string) {
  return e.selections.find((s) => s.id === `${e.id}-${suffix}`)!
}
const overround = (americans: number[]) => americans.reduce((s, a) => s + 1 / decimalFromAmerican(a), 0)

beforeEach(() => resetOverlay())
afterEach(() => resetOverlay())

describe('applyOverlay — clean book', () => {
  it('returns the SAME array reference when nothing is adjusted', () => {
    const s = slate()
    expect(applyOverlay(s)).toBe(s)
  })
})

describe('suspend', () => {
  it('marks both sides of a suspended market, leaving other markets bettable', () => {
    setMarketSuspended(EV, 'moneyline', true)
    const e = ev(applyOverlay(slate()))
    expect(pick(e, 'moneyline-home').suspended).toBe(true)
    expect(pick(e, 'moneyline-away').suspended).toBe(true)
    // the spread/total on the same game are untouched
    expect(pick(e, 'spread-home').suspended).toBeUndefined()
    expect(pick(e, 'total-over').suspended).toBeUndefined()
    expect(isMarketSuspended(EV, 'moneyline')).toBe(true)
    // other events untouched
    expect(ev(applyOverlay(slate()), 'nfl-kc-buf').selections.every((s) => !s.suspended)).toBe(true)
  })

  it('suspending the whole event suspends every market on it', () => {
    setEventSuspended(EV, true)
    const e = ev(applyOverlay(slate()))
    expect(e.selections.every((s) => s.suspended)).toBe(true)
    expect(isMarketSuspended(EV, 'spread')).toBe(true)
    setEventSuspended(EV, false)
    expect(ev(applyOverlay(slate())).selections.every((s) => !s.suspended)).toBe(true)
  })

  it('only touches upcoming events — a live/final game passes through unchanged', () => {
    setEventSuspended(EV, true)
    const live = slate().map((e) => (e.id === EV ? { ...e, status: 'live' as const } : e))
    const e = ev(applyOverlay(live))
    expect(e.selections.every((s) => !s.suspended)).toBe(true)
  })
})

describe('line moves', () => {
  it('shifts a spread on both sides and relabels, and regrades at the new number', () => {
    nudgeLine(EV, 'spread', -1) // tighten the home favourite: −3.5 → −4.5
    const e = ev(applyOverlay(slate()))
    const home = pick(e, 'spread-home')
    const away = pick(e, 'spread-away')
    expect(home.line).toBe(-4.5)
    expect(away.line).toBe(4.5)
    expect(home.label).toBe('Lakers -4.5')
    expect(away.label).toBe('Celtics +4.5')
    // A Lakers win by exactly 4 now LOSES the −4.5 (it covered the old −3.5).
    expect(gradeSelection(home, { home: 104, away: 100 })).toBe('loss')
    expect(getAdjustment(EV, 'spread')?.lineShift).toBe(-1)
  })

  it('shifts a total on both sides and relabels', () => {
    nudgeLine(EV, 'total', 1.5) // 224.5 → 226
    const e = ev(applyOverlay(slate()))
    expect(pick(e, 'total-over').line).toBe(226)
    expect(pick(e, 'total-under').line).toBe(226)
    expect(pick(e, 'total-over').label).toBe('Over 226')
  })

  it('ignores a line move on the moneyline (no handicap to move)', () => {
    nudgeLine(EV, 'moneyline', 2)
    const e = ev(applyOverlay(slate()))
    expect(pick(e, 'moneyline-home').odds).toBe(-135) // unchanged
    expect(isMarketAdjusted(EV, 'moneyline')).toBe(false)
  })

  it('accumulates nudges and a net-zero nudge clears the adjustment', () => {
    nudgeLine(EV, 'total', 0.5)
    nudgeLine(EV, 'total', 0.5)
    expect(getAdjustment(EV, 'total')?.lineShift).toBe(1)
    nudgeLine(EV, 'total', -1)
    expect(isMarketAdjusted(EV, 'total')).toBe(false)
  })
})

describe('vig / margin', () => {
  it('reprices a two-way market to the target overround, preserving the fair split', () => {
    setMargin(EV, 'moneyline', 0.03) // a tight 3% market
    const e = ev(applyOverlay(slate()))
    const home = pick(e, 'moneyline-home').odds
    const away = pick(e, 'moneyline-away').odds
    expect(overround([home, away])).toBeCloseTo(1.03, 2)
    // home was the favourite (−135) so it stays the shorter price
    expect(decimalFromAmerican(home)).toBeLessThan(decimalFromAmerican(away))
  })

  it('a standard −110/−110 spread reprices toward even money as the margin shrinks', () => {
    setMargin(EV, 'spread', 0.02)
    const e = ev(applyOverlay(slate()))
    const over = overround([pick(e, 'spread-home').odds, pick(e, 'spread-away').odds])
    expect(over).toBeCloseTo(1.02, 2)
  })

  it('setMargin(null) reverts to the feed price', () => {
    setMargin(EV, 'moneyline', 0.08)
    expect(ev(applyOverlay(slate())).selections[0].odds).not.toBe(-135)
    setMargin(EV, 'moneyline', null)
    expect(pick(ev(applyOverlay(slate())), 'moneyline-home').odds).toBe(-135)
    expect(isMarketAdjusted(EV, 'moneyline')).toBe(false)
  })
})

describe('combined + reset', () => {
  it('a move + vig + suspend all stack on one market', () => {
    nudgeLine(EV, 'total', 1)
    setMargin(EV, 'total', 0.05)
    setMarketSuspended(EV, 'total', true)
    const e = ev(applyOverlay(slate()))
    const over = pick(e, 'total-over')
    expect(over.line).toBe(225.5)
    expect(over.suspended).toBe(true)
    expect(overround([pick(e, 'total-over').odds, pick(e, 'total-under').odds])).toBeCloseTo(1.05, 2)
    resetMarket(EV, 'total')
    expect(isMarketAdjusted(EV, 'total')).toBe(false)
    expect(pick(ev(applyOverlay(slate())), 'total-over').line).toBe(224.5)
  })
})
