import { describe, it, expect } from 'vitest'
import { createLocalMoneyService } from './local-service.js'
import type { AccountSource } from './types.js'
import type { Account } from '../../core/index.js'

/** A Map-backed AccountSource (the shell wires this over its org; tests use a Map). */
function source(...accounts: Account[]): AccountSource & { peek(id: string): Account } {
  const m = new Map<string, Account>(accounts.map((a) => [a.id, a]))
  return {
    get: (id) => m.get(id) ?? null,
    set: (a) => void m.set(a.id, a),
    peek: (id) => m.get(id)!,
  }
}

const acct = (over: Partial<Account> = {}): Account => ({
  id: 'p1',
  creditLimit: 100_000,
  balance: 0,
  pending: 0,
  ...over,
})

describe('local money service (core parity)', () => {
  it('place → resolve win moves the figure exactly as core does', async () => {
    const src = source(acct())
    const money = createLocalMoneyService(src)
    const { wager } = await money.place('p1', 1000)
    expect(src.peek('p1').pending).toBe(1000)
    const { account } = await money.resolve('p1', wager.id, 'win', 2.5)
    // profit = stake*(2.5-1) = 1500; pending released
    expect(account.balance).toBe(1500)
    expect(account.pending).toBe(0)
  })

  it('place → resolve loss debits the stake', async () => {
    const money = createLocalMoneyService(source(acct()))
    const { wager } = await money.place('p1', 800)
    const { account } = await money.resolve('p1', wager.id, 'loss')
    expect(account.balance).toBe(-800)
    expect(account.pending).toBe(0)
  })

  it('resolveAt applies a fractional return like core', async () => {
    const money = createLocalMoneyService(source(acct()))
    const { wager } = await money.place('p1', 1000)
    const { account } = await money.resolveAt('p1', wager.id, 0.5) // partial loss
    expect(account.balance).toBe(-500)
  })

  it('grant credits without touching pending; settle squares up to zero', async () => {
    const money = createLocalMoneyService(source(acct({ balance: -300 })))
    let r = await money.grant('p1', 1000)
    expect(r.account.balance).toBe(700)
    r = await money.settle('p1')
    expect(r.account.balance).toBe(0)
  })

  it('rejects an over-limit stake (availableToWager) and a locked account, like core', async () => {
    const money = createLocalMoneyService(source(acct({ creditLimit: 500 })))
    await expect(money.place('p1', 600)).rejects.toThrow(/exceeds availableToWager/)

    const locked = createLocalMoneyService(source(acct({ bettingLocked: true })))
    await expect(locked.place('p1', 100)).rejects.toThrow(/betting is locked/)
  })

  it('enforces max bet and refuses a win without a valid multiplier', async () => {
    const money = createLocalMoneyService(source(acct({ maxWager: 500 })))
    await expect(money.place('p1', 600)).rejects.toThrow(/max bet/)

    const money2 = createLocalMoneyService(source(acct()))
    const { wager } = await money2.place('p1', 100)
    await expect(money2.resolve('p1', wager.id, 'win', 1)).rejects.toThrow(/payoutMultiplier > 1/)
  })

  it('refuses to double-resolve a wager', async () => {
    const money = createLocalMoneyService(source(acct()))
    const { wager } = await money.place('p1', 100)
    await money.resolve('p1', wager.id, 'push')
    await expect(money.resolve('p1', wager.id, 'loss')).rejects.toThrow(/unknown wager|already resolved/)
  })

  it('returns snapshots — mutating a returned account never reaches back into the service', async () => {
    const money = createLocalMoneyService(source(acct({ balance: 100 })))
    const got = await money.getAccount('p1')
    got!.balance = 999_999
    const again = await money.getAccount('p1')
    expect(again!.balance).toBe(100)
  })
})
