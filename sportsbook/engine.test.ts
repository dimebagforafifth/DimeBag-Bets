import { describe, it, expect } from 'vitest'
import type { Account } from '../core/index.js'
import { availableToWager } from '../core/index.js'
import { gradeTicket, hasRelatedLegs, placeTicket, priceTicket, regradeTicket } from './engine.js'
import type { MatchResult, Selection } from './markets.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000, balance: 0, pending: 0, ...overrides }
}

const leg = (eventId: string, odds: number, over: Partial<Selection> = {}): Selection => ({
  id: `${eventId}-ml-home`,
  eventId,
  market: 'moneyline',
  pick: 'home',
  label: eventId,
  odds,
  ...over,
})

const win: MatchResult = { home: 3, away: 1 }
const loss: MatchResult = { home: 1, away: 3 }
const tie: MatchResult = { home: 2, away: 2 }

describe('pricing & validation', () => {
  it('prices singles and parlays', () => {
    expect(priceTicket('single', [leg('a', 150)])).toBeCloseTo(2.5)
    expect(priceTicket('parlay', [leg('a', 100), leg('b', 100)])).toBeCloseTo(4)
    expect(() => priceTicket('parlay', [leg('a', 100)])).toThrow(/at least two/)
  })
  it('flags related (same-event) legs', () => {
    expect(hasRelatedLegs([leg('a', 100), leg('a', -110, { id: 'a-total-over' })])).toBe(true)
    expect(hasRelatedLegs([leg('a', 100), leg('b', 100)])).toBe(false)
  })
})

describe('placeTicket', () => {
  it('holds the stake through core', () => {
    const a = account()
    const t = placeTicket(a, { kind: 'single', legs: [leg('a', 150)], stake: 1000 })
    expect(t.status).toBe('open')
    expect(a.pending).toBe(1000)
    expect(a.balance).toBe(0)
  })
  it('rejects an over-limit stake and same-event parlays', () => {
    const a = account({ creditLimit: 500 })
    expect(() => placeTicket(a, { kind: 'single', legs: [leg('a', 150)], stake: 600 })).toThrow(
      /exceeds availableToWager/,
    )
    expect(availableToWager(a)).toBe(500)
    expect(() =>
      placeTicket(account(), {
        kind: 'parlay',
        legs: [leg('a', 100), leg('a', -110, { id: 'a2' })],
        stake: 100,
      }),
    ).toThrow(/same event/)
  })
})

describe('grading singles', () => {
  it('wins at the locked decimal', () => {
    const a = account()
    const t = placeTicket(a, { kind: 'single', legs: [leg('a', 150)], stake: 1000 })
    gradeTicket(a, t, { a: win })
    expect(t.status).toBe('won')
    expect(a.balance).toBe(1500) // +1.5× profit
    expect(t.returned).toBe(2500)
    expect(a.pending).toBe(0)
  })
  it('loses the stake', () => {
    const a = account()
    const t = placeTicket(a, { kind: 'single', legs: [leg('a', 150)], stake: 1000 })
    gradeTicket(a, t, { a: loss })
    expect(t.status).toBe('lost')
    expect(a.balance).toBe(-1000)
  })
  it('pushes a tie (stake returned)', () => {
    const a = account()
    const t = placeTicket(a, { kind: 'single', legs: [leg('a', 150)], stake: 1000 })
    gradeTicket(a, t, { a: tie })
    expect(t.status).toBe('push')
    expect(a.balance).toBe(0)
    expect(t.returned).toBe(1000)
  })
})

describe('grading parlays', () => {
  it('pays the product when every leg wins', () => {
    const a = account()
    const t = placeTicket(a, { kind: 'parlay', legs: [leg('a', 100), leg('b', 100)], stake: 1000 })
    gradeTicket(a, t, { a: win, b: win })
    expect(t.status).toBe('won')
    expect(a.balance).toBe(3000) // 4.0× total → +3.0× profit
  })
  it('one losing leg loses the parlay', () => {
    const a = account()
    const t = placeTicket(a, { kind: 'parlay', legs: [leg('a', 100), leg('b', 100)], stake: 1000 })
    gradeTicket(a, t, { a: win, b: loss })
    expect(t.status).toBe('lost')
    expect(a.balance).toBe(-1000)
  })
  it('a pushed leg drops out and the parlay re-prices on the rest', () => {
    const a = account()
    const t = placeTicket(a, {
      kind: 'parlay',
      legs: [leg('a', 100), leg('b', 100), leg('c', 100)],
      stake: 1000,
    })
    gradeTicket(a, t, { a: win, b: tie, c: win }) // b pushes → re-price on a,c only
    expect(t.status).toBe('won')
    expect(t.oddsDecimal).toBeCloseTo(4) // 2.0 × 2.0, not 8.0
    expect(a.balance).toBe(3000)
  })
  it('a voided leg drops out and the parlay re-prices on the rest', () => {
    const a = account()
    const t = placeTicket(a, {
      kind: 'parlay',
      legs: [leg('a', 100), leg('b', 100), leg('c', 100)],
      stake: 1000,
    })
    // b's game never went official (no result) → void; it drops out and the parlay
    // re-prices on the winners a,c only (CLAUDE.md §4).
    gradeTicket(a, t, { a: win, b: null, c: win })
    expect(t.legOutcomes).toEqual(['win', 'void', 'win'])
    expect(t.status).toBe('won')
    expect(t.oddsDecimal).toBeCloseTo(4) // 2.0 × 2.0, not 8.0
    expect(a.balance).toBe(3000) // +3.0× profit on the re-priced odds
    expect(a.pending).toBe(0)
  })

  it('a single void returns the stake (no win/loss)', () => {
    const a = account()
    const t = placeTicket(a, { kind: 'single', legs: [leg('a', 150)], stake: 1000 })
    gradeTicket(a, t, { a: null }) // game never official → void
    expect(t.status).toBe('void')
    expect(a.balance).toBe(0)
    expect(t.returned).toBe(1000)
    expect(a.pending).toBe(0)
  })

  it('pushes when every leg pushes/voids', () => {
    const a = account()
    const t = placeTicket(a, { kind: 'parlay', legs: [leg('a', 100), leg('b', 100)], stake: 1000 })
    gradeTicket(a, t, { a: tie, b: null }) // push + void
    expect(t.status).toBe('push')
    expect(a.balance).toBe(0)
    expect(a.pending).toBe(0)
  })
  it('refuses to settle twice', () => {
    const a = account()
    const t = placeTicket(a, { kind: 'single', legs: [leg('a', 150)], stake: 1000 })
    gradeTicket(a, t, { a: win })
    expect(() => gradeTicket(a, t, { a: win })).toThrow(/already settled/)
  })
})

describe('regradeTicket — max-payout cap is pinned to the original grade', () => {
  it('backs out the prior win against the cap in force AT grade, not the current cap', () => {
    // +900 odds → 10.0 decimal; uncapped profit on a 1000 stake would be 9000.
    const a = account({ maxPayout: 2000 })
    const t = placeTicket(a, { kind: 'single', legs: [leg('a', 900)], stake: 1000 })

    // First grade: WIN, capped to 2000.
    gradeTicket(a, t, { a: win })
    expect(t.status).toBe('won')
    expect(a.balance).toBe(2000) // profit 9000 capped to 2000
    expect(t.gradedMaxPayout).toBe(2000) // cap captured at grade time

    // Operator raises the cap AFTER the grade.
    a.maxPayout = 5000

    // Re-grade to a LOSS. The back-out must use the ORIGINAL cap (2000), so the
    // delta is -1000 - 2000 = -3000, landing the figure at exactly -1000 (a clean
    // first-time loss). If it wrongly used the current cap (5000) it would land at
    // 2000 - 5000 + ... — i.e. the wrong figure.
    const moved = regradeTicket(a, t, { a: loss })
    expect(moved).toBe(true)
    expect(t.status).toBe('lost')
    expect(a.balance).toBe(-1000) // delta = (-1000) - (+2000) = -3000, from +2000
  })

  it('applies the current cap to the corrected win', () => {
    const a = account({ maxPayout: 2000 })
    const t = placeTicket(a, { kind: 'single', legs: [leg('a', 900)], stake: 1000 })

    // First grade: LOSS (no cap in play on a loss), figure -1000.
    gradeTicket(a, t, { a: loss })
    expect(a.balance).toBe(-1000)
    expect(t.gradedMaxPayout).toBe(2000)

    // Operator lowers the cap, then the result is corrected to a WIN.
    a.maxPayout = 1500
    regradeTicket(a, t, { a: win })
    expect(t.status).toBe('won')
    // Corrected win uses the CURRENT cap (1500): delta = +1500 - (-1000) = +2500,
    // from -1000 → +1500 (a clean first-time capped win).
    expect(a.balance).toBe(1500)
  })

  it('legacy ticket with no stored cap falls back to the current cap', () => {
    const a = account({ maxPayout: 2000 })
    const t = placeTicket(a, { kind: 'single', legs: [leg('a', 900)], stake: 1000 })
    gradeTicket(a, t, { a: win })
    expect(a.balance).toBe(2000)

    // Simulate a ticket graded before gradedMaxPayout was recorded.
    delete (t as { gradedMaxPayout?: number | null }).gradedMaxPayout

    // Re-grade to a loss with the cap unchanged: prevEffect falls back to the
    // current cap (2000), so the figure lands at -1000 just as before.
    regradeTicket(a, t, { a: loss })
    expect(a.balance).toBe(-1000)
  })

  it('records the current cap after a re-grade for any further re-grade', () => {
    const a = account({ maxPayout: 2000 })
    const t = placeTicket(a, { kind: 'single', legs: [leg('a', 900)], stake: 1000 })
    gradeTicket(a, t, { a: win })

    a.maxPayout = 5000
    regradeTicket(a, t, { a: loss }) // now stands graded under cap 5000
    expect(t.gradedMaxPayout).toBe(5000)
    expect(a.balance).toBe(-1000)

    // A second re-grade back to a win: prevEffect (loss) = -1000, newEffect (win)
    // capped to current 5000 → delta = +5000 - (-1000) = +6000, figure -1000 → +5000.
    regradeTicket(a, t, { a: win })
    expect(t.status).toBe('won')
    expect(a.balance).toBe(5000)
  })
})
