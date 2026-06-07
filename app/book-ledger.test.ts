import { describe, it, expect } from 'vitest'
import { placeWager, resolveWager, type ResolveEvent } from '../core/index.js'
import { getBook } from './book-store.js'
import { setActiveGame } from './ledger-store.js'
import {
  getBookLedger,
  getBookLedgerVersion,
  recordBookEntry,
  resolveEntry,
  subscribeBookLedger,
} from './book-ledger.js'

const GAME = { key: 'mines', name: 'Mines' }

describe('book ledger — durable resolve entry', () => {
  it('captures a win with the running after-figure + game tag', () => {
    const e: ResolveEvent = { accountId: 'p1', wagerId: 'w1', stake: 1000, outcome: 'win', payoutMultiplier: 2, profit: 1000 }
    const entry = resolveEntry(e, { balance: 1000, pending: 0 }, GAME)
    expect(entry).toMatchObject({
      kind: 'resolve',
      accountId: 'p1',
      balanceDelta: 1000,
      pendingDelta: -1000, // the hold released on resolve
      balanceAfter: 1000,
      pendingAfter: 0,
      outcome: 'win',
      multiplier: 2,
      meta: { game: 'mines', gameName: 'Mines', stake: 1000 },
    })
  })

  it('captures a loss (negative balance delta, zero multiplier)', () => {
    const e: ResolveEvent = { accountId: 'p1', wagerId: 'w2', stake: 500, outcome: 'loss', payoutMultiplier: 0, profit: -500 }
    const entry = resolveEntry(e, { balance: -500, pending: 0 }, GAME)
    expect(entry.balanceDelta).toBe(-500)
    expect(entry.balanceAfter).toBe(-500)
    expect(entry.multiplier).toBe(0)
  })

  it('degrades to 0 after-figures when the account is not in the book', () => {
    const e: ResolveEvent = { accountId: 'ghost', wagerId: 'w3', stake: 500, outcome: 'loss', payoutMultiplier: 0, profit: -500 }
    const entry = resolveEntry(e, undefined, { key: 'casino', name: 'Casino' })
    expect(entry.balanceAfter).toBe(0)
    expect(entry.pendingAfter).toBe(0)
    expect(entry.pendingDelta).toBe(-500)
    expect(entry.balanceDelta).toBe(-500) // the delta is the real profit even when the after-figure is unknown
  })
})

// The durable singleton wiring — the part most likely to break. Uses the live store
// (memory-backed outside the browser), so these run in declared order.
describe('book ledger — durable singleton wiring', () => {
  it('captures a real resolve with the live after-figure + game tag, and notifies', () => {
    const player = Object.values(getBook().members).find((m) => m.role === 'player')!
    const before = getBookLedger().length
    const v0 = getBookLedgerVersion()
    let fired = 0
    const unsub = subscribeBookLedger(() => {
      fired += 1
    })

    const w = placeWager(player.account, 1000)
    resolveWager(player.account, w, 'win', 2) // core emits → book-ledger records

    unsub()
    const led = getBookLedger()
    expect(led.length).toBe(before + 1)
    expect(led[0]).toMatchObject({ kind: 'resolve', accountId: player.id, outcome: 'win', multiplier: 2 })
    expect(led[0].balanceAfter).toBe(player.account.balance) // the LIVE after-figure
    expect(getBookLedgerVersion()).toBeGreaterThan(v0)
    expect(fired).toBeGreaterThan(0)
  })

  it('attributes a resolve to the game it was PLACED on, not the active screen', () => {
    const player = Object.values(getBook().members).find((m) => m.role === 'player')!
    setActiveGame('dice', 'Dice')
    const w = placeWager(player.account, 1000) // placed on Dice
    setActiveGame('sportsbook', 'Sportsbook') // navigate away before it grades
    resolveWager(player.account, w, 'loss')
    expect(getBookLedger()[0].meta).toMatchObject({ game: 'dice', gameName: 'Dice' })
    setActiveGame('casino', 'Casino') // reset for other tests
  })

  it('getBookLedger() is a stable ref between reads, fresh after a movement', () => {
    const a = getBookLedger()
    expect(getBookLedger()).toBe(a) // no render loop: same reference with no change

    recordBookEntry({
      kind: 'adjust',
      accountId: 'p-marco',
      balanceDelta: 5000,
      pendingDelta: 0,
      balanceAfter: 5000,
      pendingAfter: 0,
      actor: 'operator',
      reason: 'goodwill',
    })

    const b = getBookLedger()
    expect(b).not.toBe(a) // new reference after a record
    expect(b[0]).toMatchObject({ kind: 'adjust', actor: 'operator', reason: 'goodwill' }) // newest first
  })
})
