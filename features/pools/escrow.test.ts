/**
 * Escrow conservation — the cardinal money rule. Entries hold through core; settle collects +
 * grants prizes + rake; void refunds. For every settled pool: Σ prize grants + rake == pool ==
 * guarantee + Σ collected entries. For every voided pool: refunds == holds, balances unchanged.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { type Account } from '../../core/index.js'
import { holdEntryFee, settlePoolMoney, voidPoolMoney, type EntryHold } from './escrow.js'
import { __resetPools } from './store.js'
import type { FormatWinner } from './formats/types.js'

const acct = (id: string, balance = 0): Account => ({
  id,
  creditLimit: 1_000_000,
  balance,
  pending: 0,
})
const hold = (account: Account, cents: number): EntryHold => ({
  accountId: account.id,
  account,
  wager: holdEntryFee(account, cents)!,
})
const lookup =
  (accounts: Account[]) =>
  (id: string): Account | undefined =>
    accounts.find((a) => a.id === id)

beforeEach(() => __resetPools())

describe('holdEntryFee', () => {
  it('holds the fee in pending through core; free = undefined; rejects what you can’t afford', () => {
    const a = acct('a')
    const w = holdEntryFee(a, 2_000)
    expect(w).toBeTruthy()
    expect(a.pending).toBe(2_000)
    expect(holdEntryFee(a, 0)).toBeUndefined()
    expect(() =>
      holdEntryFee({ id: 'x', creditLimit: 100, balance: 0, pending: 0 }, 1_000),
    ).toThrow()
  })
})

describe('settlePoolMoney — conservation', () => {
  it('a no-rake pool redistributes entries exactly (Σ payouts + rake == Σ entries), nets zero', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => acct(id))
    const op = acct('mgr')
    const holds = players.map((p) => hold(p, 1_000)) // four $10 entries → pool $40
    const winners: FormatWinner[] = [
      { accountId: 'a', weight: 0.6 },
      { accountId: 'b', weight: 0.3 },
      { accountId: 'c', weight: 0.1 },
    ]
    const res = settlePoolMoney({
      poolId: 'pool-1',
      guaranteedCents: 0,
      rakeBps: 0,
      holds,
      winners,
      accountOf: lookup([...players, op]),
      operatorAccount: op,
    })
    expect(res.prizePoolCents).toBe(4_000)
    expect(res.rakeCents).toBe(0)
    const paid = res.payouts.reduce((s, p) => s + p.prizeCents, 0)
    expect(paid + res.rakeCents).toBe(4_000) // == Σ entries
    expect(players[0].balance).toBe(1_400) // -1000 entry + 2400 prize
    expect(players[1].balance).toBe(200) // -1000 + 1200
    expect(players[2].balance).toBe(-600) // -1000 + 400
    expect(players[3].balance).toBe(-1_000) // out of the money
    expect(players.every((p) => p.pending === 0)).toBe(true) // holds released
    const net = [...players, op].reduce((s, p) => s + p.balance, 0)
    expect(net).toBe(0) // credits conserved (no guarantee)
  })

  it('an operator rake comes off the top, is granted to the operator, and still conserves', () => {
    const players = ['a', 'b'].map((id) => acct(id))
    const op = acct('mgr')
    const holds = players.map((p) => hold(p, 1_000)) // pool $20
    const res = settlePoolMoney({
      poolId: 'p',
      guaranteedCents: 0,
      rakeBps: 1_000, // 10%
      holds,
      winners: [{ accountId: 'a', weight: 1 }],
      accountOf: lookup([...players, op]),
      operatorAccount: op,
    })
    expect(res.rakeCents).toBe(200)
    expect(res.payouts[0].prizeCents).toBe(1_800)
    expect(op.balance).toBe(200) // rake is on the ledger (granted to the operator)
    expect(players[0].balance + players[1].balance + op.balance).toBe(0)
  })

  it('a free pool pays the operator-seeded guarantee via grant (no holds)', () => {
    const a = acct('a')
    const op = acct('mgr')
    const res = settlePoolMoney({
      poolId: 'p',
      guaranteedCents: 5_000,
      rakeBps: 0,
      holds: [],
      winners: [{ accountId: 'a', weight: 1 }],
      accountOf: lookup([a, op]),
      operatorAccount: op,
    })
    expect(res.prizePoolCents).toBe(5_000)
    expect(a.balance).toBe(5_000)
    expect(res.rakeCents).toBe(0)
  })

  it('an unresolvable winner’s share falls to the rake — credits are never destroyed', () => {
    const a = acct('a')
    const b = acct('b')
    const op = acct('mgr')
    const holds = [hold(a, 1_000), hold(b, 1_000)] // pool $20
    const res = settlePoolMoney({
      poolId: 'p',
      guaranteedCents: 0,
      rakeBps: 0,
      holds,
      // 'ghost' isn't resolvable via accountOf — its $10 share must NOT vanish.
      winners: [
        { accountId: 'a', weight: 0.5 },
        { accountId: 'ghost', weight: 0.5 },
      ],
      accountOf: lookup([a, op]),
      operatorAccount: op,
    })
    expect(res.rakeCents).toBe(1_000) // the undeliverable $10 → operator
    const paid = res.payouts.reduce((s, p) => s + p.prizeCents, 0)
    expect(paid + res.rakeCents).toBe(2_000) // conserved — nothing destroyed
    expect(a.balance + b.balance + op.balance).toBe(0)
  })

  it('refuses to settle a funded pool without an operator account (rake would otherwise vanish)', () => {
    const a = acct('a')
    const holds = [hold(a, 1_000)]
    expect(() =>
      settlePoolMoney({
        poolId: 'p',
        guaranteedCents: 0,
        rakeBps: 1_000,
        holds,
        winners: [{ accountId: 'a', weight: 1 }],
        accountOf: lookup([a]),
        operatorAccount: undefined,
      }),
    ).toThrow(/operator/)
    expect(a.pending).toBe(1_000) // threw BEFORE collecting — nothing half-applied
  })

  it('normalizes winner weights that sum past 1 so the pool is never overpaid', () => {
    const a = acct('a')
    const b = acct('b')
    const op = acct('mgr')
    const holds = [hold(a, 1_000), hold(b, 1_000)] // pool $20
    const res = settlePoolMoney({
      poolId: 'p',
      guaranteedCents: 0,
      rakeBps: 0,
      holds,
      winners: [
        { accountId: 'a', weight: 0.7 },
        { accountId: 'b', weight: 0.7 },
      ], // sums to 1.4 → must normalize, not pay $28 from a $20 pool
      accountOf: lookup([a, b, op]),
      operatorAccount: op,
    })
    const paid = res.payouts.reduce((s, p) => s + p.prizeCents, 0)
    expect(paid).toBeLessThanOrEqual(2_000)
    expect(paid + res.rakeCents).toBe(2_000)
  })

  it('weight that finds no winner (e.g. an unheld square) falls to the rake — never vanishes', () => {
    const a = acct('a')
    const op = acct('mgr')
    const holds = [hold(a, 1_000)]
    const res = settlePoolMoney({
      poolId: 'p',
      guaranteedCents: 0,
      rakeBps: 0,
      holds,
      winners: [{ accountId: 'a', weight: 0.25 }], // only 1 of 4 period-weights distributed
      accountOf: lookup([a, op]),
      operatorAccount: op,
    })
    expect(res.payouts[0].prizeCents).toBe(250)
    expect(res.rakeCents).toBe(750) // the undistributed 0.75 → operator
    expect(a.balance + op.balance).toBe(0)
  })
})

describe('voidPoolMoney — refunds', () => {
  it('refunds every hold through core; balances unchanged, pending released', () => {
    const players = ['a', 'b'].map((id) => acct(id, 500))
    const holds = players.map((p) => hold(p, 1_000))
    expect(players.every((p) => p.pending === 1_000)).toBe(true)
    voidPoolMoney(holds)
    expect(players.every((p) => p.pending === 0)).toBe(true)
    expect(players.every((p) => p.balance === 500)).toBe(true)
  })
})
