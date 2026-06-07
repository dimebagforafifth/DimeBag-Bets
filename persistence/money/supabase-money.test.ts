import { describe, it, expect } from 'vitest'
import { createSupabaseMoneyService } from './supabase-service.js'
import { createMoneyService } from './index.js'
import { createFakeSupabaseServer } from '../supabase/fake-server.js'
import type { Account } from '../../core/index.js'

const ENV = { url: 'https://fake.supabase.co', anonKey: 'anon' }
const acct = (over: Partial<Account> = {}): Account => ({
  id: 'p1',
  creditLimit: 100_000,
  balance: 0,
  pending: 0,
  ...over,
})

describe('supabase money service (server-authoritative, via the fake server)', () => {
  it('place → resolve win returns the authoritative server-computed figure', async () => {
    const server = createFakeSupabaseServer({ accounts: [acct()] })
    const money = createSupabaseMoneyService({ env: ENV, fetchImpl: server.fetch })

    const { wager } = await money.place('p1', 1000)
    expect(server.accountRow('p1')!.pending).toBe(1000) // the SERVER holds the pending

    const { account } = await money.resolve('p1', wager.id, 'win', 2.5)
    expect(account.balance).toBe(1500) // profit = 1000*(2.5-1)
    expect(account.pending).toBe(0)
    expect(server.accountRow('p1')!.balance).toBe(1500) // authoritative on the server
  })

  it('settlement rolls up server-side: figure → 0 and a settlement row is recorded', async () => {
    const server = createFakeSupabaseServer({ accounts: [acct()] })
    const money = createSupabaseMoneyService({ env: ENV, fetchImpl: server.fetch })

    // a losing week: stake 2000, lose → -2000
    const a = await money.place('p1', 2000)
    await money.resolve('p1', a.wager.id, 'loss')
    expect(server.accountRow('p1')!.balance).toBe(-2000)

    const { account } = await money.settle('p1')
    expect(account.balance).toBe(0) // reset server-side
    expect(server.settlements()).toEqual([{ account_id: 'p1', balance_before: -2000 }])
    // and a settle ledger row was written server-side
    expect(server.ledger().some((l) => l.kind === 'settle' && l.balance_after === 0)).toBe(true)
  })

  it('a client CANNOT overwrite its own balance — a direct table write is refused; only the RPC moves it', async () => {
    const server = createFakeSupabaseServer({ accounts: [acct({ balance: 100 })] })

    // A tampered client tries to PATCH its balance straight into the accounts table.
    const forged = await server.fetch('https://fake.supabase.co/rest/v1/accounts?id=eq.p1', {
      method: 'PATCH',
      body: JSON.stringify({ balance: 999_999_999 }),
    })
    expect(forged.ok).toBe(false)
    expect(forged.status).toBe(403) // RLS: no client write grant on the money table
    expect(server.accountRow('p1')!.balance).toBe(100) // figure untouched by the forgery

    // The ONLY way the figure moves is the validated RPC.
    const money = createSupabaseMoneyService({ env: ENV, fetchImpl: server.fetch })
    const { account } = await money.grant('p1', 500)
    expect(account.balance).toBe(600)
    expect(server.accountRow('p1')!.balance).toBe(600)
  })

  it('server-side validation errors surface to the client with core’s messages', async () => {
    const server = createFakeSupabaseServer({ accounts: [acct({ creditLimit: 500 })] })
    const money = createSupabaseMoneyService({ env: ENV, fetchImpl: server.fetch })
    await expect(money.place('p1', 600)).rejects.toThrow(/exceeds availableToWager/)
    // and the failed attempt left nothing on the server
    expect(server.accountRow('p1')!.pending).toBe(0)
  })

  it('getAccount reads the authoritative row through the REST endpoint', async () => {
    const server = createFakeSupabaseServer({ accounts: [acct({ balance: 42 })] })
    const money = createSupabaseMoneyService({ env: ENV, fetchImpl: server.fetch })
    const a = await money.getAccount('p1')
    expect(a).toMatchObject({ id: 'p1', balance: 42, creditLimit: 100_000 })
    expect(await money.getAccount('nope')).toBeNull()
  })
})

describe('createMoneyService (selector)', () => {
  it('uses the local in-process service when no keys are set', async () => {
    const accounts = new Map<string, Account>([['p1', acct()]])
    const money = createMoneyService({
      localSource: { get: (id) => accounts.get(id) ?? null, set: (a) => void accounts.set(a.id, a) },
      envSource: {},
    })
    const { wager } = await money.place('p1', 1000)
    await money.resolve('p1', wager.id, 'win', 2)
    expect(accounts.get('p1')!.balance).toBe(1000) // mutated the LOCAL source, no server
  })

  it('uses the Supabase RPC service when keys are present', async () => {
    const server = createFakeSupabaseServer({ accounts: [acct()] })
    const money = createMoneyService({
      localSource: { get: () => null, set: () => {} }, // must be ignored
      envSource: { SUPABASE_URL: ENV.url, SUPABASE_ANON_KEY: ENV.anonKey },
      fetchImpl: server.fetch,
    })
    const { wager } = await money.place('p1', 1000)
    await money.resolve('p1', wager.id, 'win', 2)
    expect(server.accountRow('p1')!.balance).toBe(1000) // moved on the SERVER
  })
})
