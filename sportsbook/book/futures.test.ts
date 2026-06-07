import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Account } from '../../core/index.js'
import { FUTURES } from '../bets/futures.js'
import {
  getFutureMarket,
  getFutures,
  gradeFutureTicket,
  placeFutureTicket,
  resetFutures,
  settleFuture,
} from './futures.js'

function account(over: Partial<Account> = {}): Account {
  return { id: 'p1', creditLimit: 1_000_000, balance: 0, pending: 0, ...over }
}
const NBA = FUTURES.find((m) => m.id === 'nba-champ-2026')!

beforeEach(() => resetFutures())
afterEach(() => resetFutures())

describe('futures settlement book', () => {
  it('starts open and returns the base slate reference when clean', () => {
    expect(getFutures()).toBe(FUTURES)
    expect(getFutureMarket('nba-champ-2026')?.status).toBe('open')
  })

  it('settleFuture marks the market settled with the winner, without mutating the base', () => {
    settleFuture('nba-champ-2026', 'bos')
    const m = getFutureMarket('nba-champ-2026')!
    expect(m.status).toBe('settled')
    expect(m.winnerId).toBe('bos')
    // the immutable base is untouched (another player would re-read it the same way)
    expect(FUTURES.find((x) => x.id === 'nba-champ-2026')!.status).toBe('open')
  })

  it('rejects settling an unknown market or outcome', () => {
    expect(() => settleFuture('nope', 'bos')).toThrow(/unknown futures market/)
    expect(() => settleFuture('nba-champ-2026', 'nope')).toThrow(/unknown outcome/)
  })
})

describe('futures tickets through core', () => {
  it('placing holds the stake in pending and locks the decimal price', () => {
    const a = account()
    const t = placeFutureTicket(a, NBA, 'bos', 1000) // Celtics +350 → decimal 4.5
    expect(a.pending).toBe(1000)
    expect(a.balance).toBe(0)
    expect(t.oddsDecimal).toBe(4.5)
    expect(t.status).toBe('open')
  })

  it('refuses a bet on a settled market', () => {
    const a = account()
    settleFuture('nba-champ-2026', 'bos')
    expect(() => placeFutureTicket(a, getFutureMarket('nba-champ-2026')!, 'okc', 1000)).toThrow(
      /already settled/,
    )
    expect(a.pending).toBe(0)
  })

  it('grades a winner at the locked decimal through core (figure moves by the profit)', () => {
    const a = account()
    const t = placeFutureTicket(a, NBA, 'bos', 1000) // +350 → 4.5×
    settleFuture('nba-champ-2026', 'bos')
    gradeFutureTicket(a, t, getFutureMarket('nba-champ-2026')!)
    expect(t.status).toBe('won')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(3500) // profit = stake × (4.5 − 1)
    expect(t.returned).toBe(4500)
  })

  it('grades a loser as a full loss through core', () => {
    const a = account()
    const t = placeFutureTicket(a, NBA, 'okc', 1000)
    settleFuture('nba-champ-2026', 'bos') // someone else won
    gradeFutureTicket(a, t, getFutureMarket('nba-champ-2026')!)
    expect(t.status).toBe('lost')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(-1000)
    expect(t.returned).toBe(0)
  })

  it('a ticket can only be graded once', () => {
    const a = account()
    const t = placeFutureTicket(a, NBA, 'bos', 1000)
    settleFuture('nba-champ-2026', 'bos')
    gradeFutureTicket(a, t, getFutureMarket('nba-champ-2026')!)
    expect(() => gradeFutureTicket(a, t, getFutureMarket('nba-champ-2026')!)).toThrow(/already settled/)
  })
})
