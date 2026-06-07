import { describe, it, expect } from 'vitest'
import { grant, onGrant, onWagerResolved, type Account, type GrantEvent } from './index.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'p1', creditLimit: 100000, balance: 0, pending: 0, ...overrides }
}

describe('grant — operator bonus credit', () => {
  it('raises the figure by the granted amount, leaving pending untouched', () => {
    const a = account({ balance: 5000, pending: 1000 })
    grant(a, 2500)
    expect(a.balance).toBe(7500)
    expect(a.pending).toBe(1000) // a grant is not a wager
  })

  it('can credit beyond the credit room (the house is giving, not risking)', () => {
    const a = account({ creditLimit: 1000, balance: -1000 }) // maxed out
    grant(a, 50000)
    expect(a.balance).toBe(49000) // no availableToWager gate on a gift
  })

  it('fires a GrantEvent (not a wager resolution) with context', () => {
    const a = account()
    const grants: GrantEvent[] = []
    let resolves = 0
    const offG = onGrant((e) => grants.push(e))
    const offR = onWagerResolved(() => (resolves += 1))
    grant(a, 1500, { promo: 'welcome' })
    offG()
    offR()
    expect(grants).toEqual([{ accountId: 'p1', cents: 1500, meta: { promo: 'welcome' } }])
    expect(resolves).toBe(0) // never crosses the wager channel
  })

  it('rejects non-positive and non-integer amounts', () => {
    const a = account()
    expect(() => grant(a, 0)).toThrow(/positive/)
    expect(() => grant(a, -100)).toThrow(/positive/)
    expect(() => grant(a, 12.5)).toThrow(/whole number/)
    expect(a.balance).toBe(0) // nothing applied on a bad grant
  })
})
