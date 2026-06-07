import { describe, it, expect } from 'vitest'
import type { Account } from '../core/index.js'
import { availableToWager } from '../core/index.js'
import { gradeTicket, hasRelatedLegs, placeTicket, priceTicket } from './engine.js'
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
