import { describe, it, expect } from 'vitest'
import type { Account } from './types.js'
import {
  adjustBalance,
  availableToWager,
  placeWager,
  placeWagers,
  resolveAtMultiplier,
  resolveWager,
  settleWeek,
} from './core.js'

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

  it('throws on a win without a valid (> 1) multiplier — atomically, leaving the account untouched', () => {
    const a = account()
    const w = placeWager(a, 100)
    expect(a.pending).toBe(100)
    expect(() => resolveWager(a, w, 'win')).toThrow(/payoutMultiplier > 1/)
    expect(() => resolveWager(a, w, 'win', 1)).toThrow(/payoutMultiplier > 1/)
    // A failed grade must NOT half-settle: the hold is still on, the figure unmoved,
    // and the wager still open. (Before the fix the throw fired AFTER releasing
    // pending, so the hold leaked and the wager was left dangling.)
    expect(a.pending).toBe(100)
    expect(a.balance).toBe(0)
    expect(w.status).toBe('open')
    // …and it can then be graded correctly, proving nothing was corrupted.
    resolveWager(a, w, 'win', 2)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(100)
    expect(w.status).toBe('resolved')
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

describe('resolveAtMultiplier — generic fractional settlement', () => {
  it('m > 1 is a win: balance += stake × (m − 1), tagged win', () => {
    const a = account()
    const w = placeWager(a, 200)
    resolveAtMultiplier(a, w, 2.5)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(300)
    expect(w.outcome).toBe('win')
    expect(w.payoutMultiplier).toBe(2.5)
  })

  it('m = 1 is a push: stake returned, figure unchanged', () => {
    const a = account({ balance: 50 })
    const w = placeWager(a, 200)
    resolveAtMultiplier(a, w, 1)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(50)
    expect(w.outcome).toBe('push')
  })

  it('0 < m < 1 is a partial loss: only the unreturned part leaves the figure', () => {
    const a = account()
    const w = placeWager(a, 200)
    resolveAtMultiplier(a, w, 0.4) // get back 80, lose 120
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(-120)
    expect(w.outcome).toBe('loss')
  })

  it('m = 0 is a total loss, equivalent to resolveWager loss', () => {
    const a = account()
    const w = placeWager(a, 200)
    resolveAtMultiplier(a, w, 0)
    expect(a.balance).toBe(-200)
    expect(w.outcome).toBe('loss')
  })

  it('rounds the fractional figure change to whole points', () => {
    const a = account()
    const w = placeWager(a, 99)
    resolveAtMultiplier(a, w, 0.5) // 99 × (−0.5) = −49.5 → −49 (Math.round ties toward +∞)
    expect(a.balance).toBe(-49)
  })

  it('rejects negative or non-finite multipliers, double-resolve, and mismatch', () => {
    const a = account()
    expect(() => resolveAtMultiplier(a, placeWager(a, 50), -0.5)).toThrow(/≥ 0/)
    expect(() => resolveAtMultiplier(a, placeWager(a, 50), Infinity)).toThrow(/finite/)
    const w = placeWager(a, 50)
    resolveAtMultiplier(a, w, 2)
    expect(() => resolveAtMultiplier(a, w, 2)).toThrow(/already resolved/)
    expect(() => resolveAtMultiplier(account({ id: 'other' }), placeWager(a, 50), 2)).toThrow(
      /does not belong/,
    )
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

  it('simultaneous bets: holds stack, available enforces them together, and each grades independently', () => {
    const a = account() // creditLimit 1000
    const w1 = placeWager(a, 300)
    const w2 = placeWager(a, 200)
    const w3 = placeWager(a, 500)
    // Every live hold counts against availableToWager at once.
    expect(a.pending).toBe(1000)
    expect(availableToWager(a)).toBe(0)
    // A further bet can't fit while all three are at risk.
    expect(() => placeWager(a, 1)).toThrow(/exceeds availableToWager/)
    // They settle independently, each moving only its own stake.
    resolveWager(a, w1, 'win', 2) // +300
    resolveWager(a, w2, 'loss') // −200
    resolveWager(a, w3, 'push') // 0, stake returned
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(100)
    expect(availableToWager(a)).toBe(1100)
  })
})

describe('placeWagers — atomic multi-bet placement', () => {
  it('holds every stake when the whole batch fits', () => {
    const a = account() // creditLimit 1000
    const ws = placeWagers(a, [300, 200, 100])
    expect(ws).toHaveLength(3)
    expect(ws.every((w) => w.status === 'open')).toBe(true)
    expect(a.pending).toBe(600)
    expect(availableToWager(a)).toBe(400)
  })

  it('rolls back ALL holds if a later stake does not fit — account untouched', () => {
    const a = account() // creditLimit 1000
    // 600 + 500 = 1100 > 1000: the second placement fails, so the first must release.
    expect(() => placeWagers(a, [600, 500])).toThrow(/exceeds availableToWager/)
    expect(a.pending).toBe(0) // the 600 hold was rolled back — nothing stranded
    expect(a.balance).toBe(0)
    expect(availableToWager(a)).toBe(1000)
  })

  it('rolls back when a stake trips a per-head max bet', () => {
    const a = account({ maxWager: 400 })
    expect(() => placeWagers(a, [300, 500])).toThrow(/max bet/)
    expect(a.pending).toBe(0)
  })

  it('rolls back when a stake is invalid (non-integer), leaving nothing held', () => {
    const a = account()
    expect(() => placeWagers(a, [200, 10.5])).toThrow(/whole number/)
    expect(a.pending).toBe(0)
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

describe('per-head min bet + max payout', () => {
  it('rejects a stake below the min bet, accepts at the floor', () => {
    const a = account({ minWager: 500 })
    expect(() => placeWager(a, 100)).toThrow(/below the minimum/)
    expect(placeWager(a, 500).stake).toBe(500)
  })

  it('caps a winning profit at maxPayout (resolveWager)', () => {
    const a = account({ creditLimit: 100_000, maxPayout: 1000 })
    resolveWager(a, placeWager(a, 1000), 'win', 10) // natural +9000, capped to +1000
    expect(a.balance).toBe(1000)
  })

  it('caps profit at maxPayout (resolveAtMultiplier), but never caps a loss/partial', () => {
    const a = account({ creditLimit: 100_000, maxPayout: 1000 })
    resolveAtMultiplier(a, placeWager(a, 1000), 5) // +4000 → capped +1000
    expect(a.balance).toBe(1000)
    const b = account({ creditLimit: 100_000, maxPayout: 1000 })
    resolveAtMultiplier(b, placeWager(b, 1000), 0.5) // partial loss −500, cap irrelevant
    expect(b.balance).toBe(-500)
  })

  it('records the EFFECTIVE multiplier when a payout is capped (display stays truthful)', () => {
    const a = account({ creditLimit: 100_000, maxPayout: 1000 })
    const w = a && placeWager(a, 1000)
    resolveWager(a, w, 'win', 10) // natural 10× → profit 9000 capped to 1000 → effective 2×
    expect(w.payoutMultiplier).toBe(2)

    const b = account({ creditLimit: 100_000, maxPayout: 1000 })
    const w2 = placeWager(b, 1000)
    resolveAtMultiplier(b, w2, 5) // +4000 capped 1000 → effective 2×
    expect(w2.payoutMultiplier).toBe(2)
  })
})

describe('adjustBalance (manual figure adjustment)', () => {
  it('credits and debits the figure without touching pending', () => {
    const a = account({ balance: 0, pending: 50 })
    adjustBalance(a, 5000) // a re-credit / comp
    expect(a.balance).toBe(5000)
    adjustBalance(a, -2000) // a debit / correction
    expect(a.balance).toBe(3000)
    expect(a.pending).toBe(50) // holds are untouched
  })

  it('is a deliberate override — not bounded by the credit limit', () => {
    const a = account({ creditLimit: 1000, balance: 0 })
    adjustBalance(a, -5000) // can push past the credit limit (an operator correction)
    expect(a.balance).toBe(-5000)
  })

  it('rejects a non-integer delta', () => {
    expect(() => adjustBalance(account(), 12.5)).toThrow(/whole number/)
  })
})
