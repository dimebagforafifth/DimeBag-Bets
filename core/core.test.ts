import { describe, it, expect } from 'vitest'
import type { Account } from './types.js'
import { availableToWager, placeWager, resolveWager, settleWeek } from './core.js'

/** A fresh account for each test. creditLimit 1000, flat figure, nothing pending. */
function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 1000, balance: 0, pending: 0, ...overrides }
}

describe('availableToWager', () => {
  it('is creditLimit + balance − pending', () => {
    expect(availableToWager(account())).toBe(1000)
    expect(availableToWager(account({ balance: 250 }))).toBe(1250)
    expect(availableToWager(account({ balance: -250 }))).toBe(750)
    expect(availableToWager(account({ pending: 400 }))).toBe(600)
    expect(availableToWager(account({ balance: -200, pending: 300 }))).toBe(500)
  })
})

describe('placeWager', () => {
  it('accepts a stake that fits and holds it in pending', () => {
    const a = account()
    const w = placeWager(a, 400)
    expect(w.status).toBe('open')
    expect(w.stake).toBe(400)
    expect(w.accountId).toBe('acct_1')
    expect(a.pending).toBe(400)
    expect(a.balance).toBe(0)
    expect(availableToWager(a)).toBe(600)
  })

  it('accepts a stake exactly equal to what is available', () => {
    const a = account()
    expect(() => placeWager(a, 1000)).not.toThrow()
    expect(availableToWager(a)).toBe(0)
  })

  it('lets a player bet into credit (negative balance) up to the limit', () => {
    const a = account({ balance: -600 }) // available = 400
    placeWager(a, 400)
    expect(a.pending).toBe(400)
    expect(availableToWager(a)).toBe(0)
  })

  it('rejects a stake beyond what is available', () => {
    const a = account()
    expect(() => placeWager(a, 1001)).toThrow(/exceeds availableToWager/)
    expect(a.pending).toBe(0) // unchanged on rejection
  })

  it('rejects non-positive and non-integer stakes', () => {
    const a = account()
    expect(() => placeWager(a, 0)).toThrow(/positive/)
    expect(() => placeWager(a, -50)).toThrow(/positive/)
    expect(() => placeWager(a, 10.5)).toThrow(/whole number/)
    expect(a.pending).toBe(0)
  })

  it('accepts a caller-supplied id', () => {
    const a = account()
    const w = placeWager(a, 100, 'mines_round_7')
    expect(w.id).toBe('mines_round_7')
  })
})

describe('resolveWager', () => {
  it('win: releases the hold and adds profit = stake × (mult − 1)', () => {
    const a = account()
    const w = placeWager(a, 200)
    resolveWager(a, w, 'win', 2.5)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(300) // 200 × 1.5
    expect(w.status).toBe('resolved')
    expect(w.outcome).toBe('win')
    expect(w.payoutMultiplier).toBe(2.5)
  })

  it('rounds fractional profit to whole points', () => {
    const a = account()
    const w = placeWager(a, 99)
    resolveWager(a, w, 'win', 2.5) // profit 99 × 1.5 = 148.5 → 149 (round half up)
    expect(a.balance).toBe(149)
  })

  it('loss: releases the hold and subtracts the stake', () => {
    const a = account()
    const w = placeWager(a, 200)
    resolveWager(a, w, 'loss')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(-200)
    expect(w.outcome).toBe('loss')
  })

  it('push: releases the hold, balance unchanged', () => {
    const a = account({ balance: 50 })
    const w = placeWager(a, 200)
    resolveWager(a, w, 'push')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(50)
  })

  it('void: releases the hold, balance unchanged', () => {
    const a = account({ balance: 50 })
    const w = placeWager(a, 200)
    resolveWager(a, w, 'void')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(50)
  })

  it('throws on a win without a valid (> 1) multiplier', () => {
    const a = account()
    const w = placeWager(a, 100)
    expect(() => resolveWager(a, w, 'win')).toThrow(/payoutMultiplier > 1/)
    expect(() => resolveWager(a, w, 'win', 1)).toThrow(/payoutMultiplier > 1/)
  })

  it('throws on double-resolve', () => {
    const a = account()
    const w = placeWager(a, 100)
    resolveWager(a, w, 'loss')
    expect(() => resolveWager(a, w, 'win', 2)).toThrow(/already resolved/)
  })

  it('throws when the wager belongs to another account', () => {
    const a = account()
    const w = placeWager(a, 100)
    const other = account({ id: 'acct_2' })
    expect(() => resolveWager(other, w, 'loss')).toThrow(/does not belong/)
  })
})

describe('full lifecycle', () => {
  it('place → resolve leaves pending at 0 and the figure correct', () => {
    const a = account()
    const w1 = placeWager(a, 300)
    const w2 = placeWager(a, 200)
    expect(a.pending).toBe(500)

    resolveWager(a, w1, 'win', 2) // +300
    resolveWager(a, w2, 'loss') // −200

    expect(a.pending).toBe(0)
    expect(a.balance).toBe(100)
    expect(availableToWager(a)).toBe(1100)
  })
})

describe('settleWeek', () => {
  it('resets a positive figure to zero', () => {
    const a = account({ balance: 450 })
    settleWeek(a)
    expect(a.balance).toBe(0)
  })

  it('resets a negative figure to zero', () => {
    const a = account({ balance: -450 })
    settleWeek(a)
    expect(a.balance).toBe(0)
  })

  it('refuses to settle while wagers are still pending', () => {
    const a = account()
    placeWager(a, 100)
    expect(() => settleWeek(a)).toThrow(/still pending/)
  })
})
