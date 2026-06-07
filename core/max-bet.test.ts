/**
 * Per-head max-bet cap (the operator's "max wager" lever) — enforced in
 * `placeWager` so every game and the sportsbook honour it without their own
 * checks, and surfaced via `maxBet` for clamping a bet input.
 */

import { describe, expect, it } from 'vitest'
import { availableToWager, maxBet, placeWager, type Account } from './index.js'

function account(over: Partial<Account> = {}): Account {
  return { id: 'p', creditLimit: 10_000, balance: 0, pending: 0, ...over }
}

describe('maxBet', () => {
  it('is just availableToWager when no per-head cap is set', () => {
    const a = account({ balance: 2_000 })
    expect(a.maxWager).toBeUndefined()
    expect(maxBet(a)).toBe(availableToWager(a)) // 12,000
  })

  it('caps at the per-head max when it is the tighter bound', () => {
    const a = account({ balance: 5_000, maxWager: 1_000 })
    expect(availableToWager(a)).toBe(15_000)
    expect(maxBet(a)).toBe(1_000)
  })

  it('falls back to availableToWager when the player is near their credit limit', () => {
    const a = account({ balance: -9_500, maxWager: 1_000 }) // only 500 of credit left
    expect(availableToWager(a)).toBe(500)
    expect(maxBet(a)).toBe(500) // the credit wall bites before the max bet
  })
})

describe('placeWager respects the per-head cap', () => {
  it('accepts a stake at the cap', () => {
    const a = account({ maxWager: 1_000 })
    const w = placeWager(a, 1_000)
    expect(w.stake).toBe(1_000)
    expect(a.pending).toBe(1_000)
  })

  it('rejects a stake over the cap even when credit would allow it', () => {
    const a = account({ maxWager: 1_000 })
    expect(availableToWager(a)).toBe(10_000) // credit allows far more
    expect(() => placeWager(a, 1_001)).toThrow(/max bet/)
    expect(a.pending).toBe(0) // nothing held on a rejected bet
  })

  it('still rejects on the credit wall first when that is tighter', () => {
    const a = account({ creditLimit: 500, maxWager: 1_000 })
    expect(() => placeWager(a, 800)).toThrow(/availableToWager/)
  })

  it('is a no-op cap when maxWager is undefined (existing behaviour unchanged)', () => {
    const a = account()
    expect(() => placeWager(a, 10_000)).not.toThrow()
  })
})
