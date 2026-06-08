/**
 * The book money service computes correctly over the LIVE org, and the SAME wiring
 * flips server-authoritative when keys are present (the figure then moves on the server,
 * never the local book). Uses deltas so it doesn't depend on the seeded figures.
 */

import { describe, it, expect } from 'vitest'
import { bookMoney, bookAccountSource } from './money-service.js'
import { getBook } from './book-store.js'
import { createMoneyService } from '../persistence/index.js'
import { createFakeSupabaseServer } from '../persistence/supabase/fake-server.js'

const bal = (id: string) => getBook().members[id].account.balance
const pend = (id: string) => getBook().members[id].account.pending

describe('bookMoney over the live book (local, no keys)', () => {
  it('grant moves the real figure through the service (no pending change)', async () => {
    const before = bal('p-lena')
    const { account } = await bookMoney.grant('p-lena', 500)
    expect(account.balance).toBe(before + 500) // authoritative result
    expect(bal('p-lena')).toBe(before + 500) // landed on the live book
    expect(pend('p-lena')).toBe(0)
  })

  it('place → resolve win computes correctly on the live book', async () => {
    const b0 = bal('p-lena')
    const { wager } = await bookMoney.place('p-lena', 1000)
    expect(pend('p-lena')).toBe(1000) // hold on the live account
    const { account } = await bookMoney.resolve('p-lena', wager.id, 'win', 2)
    expect(account.balance).toBe(b0 + 1000) // profit = 1000*(2-1)
    expect(bal('p-lena')).toBe(b0 + 1000)
    expect(pend('p-lena')).toBe(0)
  })

  it('the AccountSource reads the live account', () => {
    expect(bookAccountSource.get('p-lena')).toBe(getBook().members['p-lena'].account)
    expect(bookAccountSource.get('nobody')).toBeNull()
  })
})

describe('the same wiring is server-authoritative with keys', () => {
  it('routes the mutation to the server and never touches the local book', async () => {
    const server = createFakeSupabaseServer({
      accounts: [{ id: 'p-lena', creditLimit: 200_000, balance: 0, pending: 0 }],
    })
    const serverMoney = createMoneyService({
      localSource: bookAccountSource, // present but IGNORED when keys are set
      envSource: { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_ANON_KEY: 'anon' },
      fetchImpl: server.fetch,
    })

    const localBefore = bal('p-lena')
    const { account } = await serverMoney.grant('p-lena', 750)
    expect(account.balance).toBe(750) // moved on the SERVER
    expect(server.accountRow('p-lena')!.balance).toBe(750)
    expect(bal('p-lena')).toBe(localBefore) // local book untouched — server is authoritative
  })
})
