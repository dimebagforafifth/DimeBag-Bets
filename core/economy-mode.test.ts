/**
 * Economy mode at the core/org layer:
 *   - placeWager: credit mode allows the figure down to −limit; balance mode rejects any
 *     overdraw below the floor.
 *   - settleOrgWeek: credit mode rolls every figure up and zeroes the book; balance mode is a
 *     reporting snapshot — balances persist, nothing collects or resets.
 * The default credit-mode behaviour is byte-identical to before (no policy set).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { availableToWager, placeWager, setEconomyPolicy, __resetEconomy, type Account } from './index.js'
import { createOrg, addPlayer, settleOrgWeek, getMember } from '../org/index.js'

afterEach(() => __resetEconomy())

const acct = (over: Partial<Account> = {}): Account => ({ id: 'p', creditLimit: 1_000, balance: 0, pending: 0, ...over })

describe('availableToWager / placeWager branch on mode', () => {
  it('credit mode (default): figure may run down to the credit limit', () => {
    const a = acct({ creditLimit: 1_000, balance: 0 })
    expect(availableToWager(a)).toBe(1_000)
    expect(() => placeWager(a, 1_000)).not.toThrow() // right to the limit
    const b = acct({ creditLimit: 1_000, balance: 0 })
    expect(() => placeWager(b, 1_001)).toThrow(/exceeds availableToWager/)
  })

  it('balance mode: you can only risk credits you hold — overdraw below the floor is rejected', () => {
    setEconomyPolicy({ mode: 'balance', balanceFloorCents: 0 })
    const a = acct({ creditLimit: 1_000, balance: 500 }) // credit line is ignored in balance mode
    expect(availableToWager(a)).toBe(500)
    expect(() => placeWager(a, 500)).not.toThrow()
    const b = acct({ creditLimit: 1_000, balance: 500 })
    expect(() => placeWager(b, 501)).toThrow(/exceeds availableToWager/) // would drive below 0
  })

  it('balance mode honours a non-zero floor', () => {
    setEconomyPolicy({ mode: 'balance', balanceFloorCents: 100 })
    const a = acct({ balance: 500 })
    expect(availableToWager(a)).toBe(400) // 500 − 0 − 100
  })
})

describe('settleOrgWeek branches on mode', () => {
  function book() {
    const org = createOrg({ name: 'Book', creditLimit: 10_000_000, id: 'mgr' })
    const p1 = addPlayer(org, 'mgr', { name: 'P1', creditLimit: 200_000, id: 'p1' })
    const p2 = addPlayer(org, 'mgr', { name: 'P2', creditLimit: 200_000, id: 'p2' })
    p1.account.balance = -30_000 // down
    p2.account.balance = 50_000 // up
    return org
  }

  it('credit mode (default): rolls figures up and zeroes the book', () => {
    const org = book()
    settleOrgWeek(org)
    expect(getMember(org, 'p1').account.balance).toBe(0)
    expect(getMember(org, 'p2').account.balance).toBe(0)
    expect(getMember(org, 'mgr').account.balance).toBe(0) // manager squared for the new week
  })

  it('balance mode: a P&L snapshot — balances persist, nothing collects or resets', () => {
    setEconomyPolicy({ mode: 'balance' })
    const org = book()
    const statement = settleOrgWeek(org)
    // Balances are untouched — no roll-up, no zeroing, no weekly collect.
    expect(getMember(org, 'p1').account.balance).toBe(-30_000)
    expect(getMember(org, 'p2').account.balance).toBe(50_000)
    // The statement is still produced (reporting), one line per member.
    expect(statement.length).toBe(Object.keys(org.members).length)
  })
})
