/**
 * Betting lock (the operator's "no new action" switch) — enforced in
 * `placeWager` so every game and the sportsbook refuse new bets on a locked
 * account, while existing wagers still settle and the figure is untouched.
 */

import { describe, expect, it } from 'vitest'
import {
  availableToWager,
  placeWager,
  resolveWager,
  settleWeek,
  type Account,
} from './index.js'

function account(over: Partial<Account> = {}): Account {
  return { id: 'p', creditLimit: 10_000, balance: 0, pending: 0, ...over }
}

describe('placeWager honours the betting lock', () => {
  it('refuses a new bet when locked, even with credit available', () => {
    const a = account({ bettingLocked: true })
    expect(availableToWager(a)).toBe(10_000) // plenty of room
    expect(() => placeWager(a, 100)).toThrow(/locked/)
    expect(a.pending).toBe(0) // nothing held on a refused bet
  })

  it('is open when the flag is undefined or false (unchanged behaviour)', () => {
    expect(() => placeWager(account(), 5_000)).not.toThrow()
    expect(() => placeWager(account({ bettingLocked: false }), 5_000)).not.toThrow()
  })

  it('lets a bet placed before the lock still settle (lock is new-action only)', () => {
    const a = account()
    const w = placeWager(a, 1_000)
    a.bettingLocked = true // manager freezes the account mid-week
    expect(() => resolveWager(a, w, 'win', 2)).not.toThrow()
    expect(a.balance).toBe(1_000) // the open bet graded normally
    expect(a.pending).toBe(0)
  })

  it('does not block weekly settlement of a locked account', () => {
    const a = account({ balance: -2_500, bettingLocked: true })
    expect(() => settleWeek(a)).not.toThrow()
    expect(a.balance).toBe(0)
  })
})
