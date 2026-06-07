import { describe, it, expect } from 'vitest'
import type { Account } from '../core/index.js'
import { cashOutTicket, cashOutValue, placeTicket } from './engine.js'
import { EVENTS, type GameEvent, type MatchResult, type Selection } from './markets.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000, balance: 0, pending: 0, ...overrides }
}

const sel = (eventId: string, suffix: string): Selection =>
  EVENTS.flatMap((e) => e.selections).find((s) => s.id === `${eventId}-${suffix}`)!

function slate(overrides: Record<string, Partial<GameEvent>> = {}): GameEvent[] {
  return EVENTS.map((e) => ({ ...e, status: 'upcoming', ...overrides[e.id] }))
}

const live = (score: MatchResult, progress: number): Partial<GameEvent> => ({ status: 'live', score, progress })
const final = (score: MatchResult): Partial<GameEvent> => ({ status: 'final', score })

describe('cashOutValue', () => {
  it('is 0 before anything has kicked off', () => {
    const a = account()
    const t = placeTicket(a, { kind: 'single', legs: [sel('nba-lal-bos', 'moneyline-home')], stake: 1000 })
    expect(cashOutValue(t, slate())).toBe(0)
  })

  it('offers more the better the bet looks live, capped under the full payout', () => {
    const a = account()
    const t = placeTicket(a, { kind: 'single', legs: [sel('nba-lal-bos', 'moneyline-home')], stake: 1000 })
    const leadingLate = cashOutValue(t, slate({ 'nba-lal-bos': live({ home: 30, away: 12 }, 0.9) }))
    const trailingLate = cashOutValue(t, slate({ 'nba-lal-bos': live({ home: 12, away: 30 }, 0.9) }))
    expect(leadingLate).toBeGreaterThan(trailingLate)
    // never more than the full win would pay (-135 → 1.74×)
    expect(leadingLate).toBeLessThanOrEqual(Math.round(1000 * (1 + 100 / 135)))
  })

  it('is 0 once a leg has lost', () => {
    const a = account()
    const t = placeTicket(a, {
      kind: 'parlay',
      legs: [sel('nba-lal-bos', 'moneyline-home'), sel('nfl-kc-buf', 'moneyline-home')],
      stake: 1000,
    })
    // Lakers (home) lose their game → parlay dead.
    expect(cashOutValue(t, slate({ 'nba-lal-bos': final({ home: 100, away: 120 }) }))).toBe(0)
  })
})

describe('cashOutTicket', () => {
  it('settles the ticket now and credits the cash value', () => {
    const a = account()
    const t = placeTicket(a, { kind: 'single', legs: [sel('nba-lal-bos', 'moneyline-home')], stake: 1000 })
    const events = slate({ 'nba-lal-bos': live({ home: 28, away: 14 }, 0.85) })
    const value = cashOutValue(t, events)
    expect(value).toBeGreaterThan(0)

    cashOutTicket(a, t, events)
    expect(t.status).toBe('cashed')
    expect(t.returned).toBe(value)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(value - 1000) // figure moves by cash value minus stake held
  })

  it('refuses when there is nothing to cash out', () => {
    const a = account()
    const t = placeTicket(a, { kind: 'single', legs: [sel('nba-lal-bos', 'moneyline-home')], stake: 1000 })
    expect(() => cashOutTicket(a, t, slate())).toThrow(/cannot be cashed out/)
  })
})
