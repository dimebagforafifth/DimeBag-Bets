/**
 * The materialized projection store: the cardinal invariant (Σ net_cents == ledger net, no
 * inflation), deterministic drop+rebuild, recompute-on-settlement, and per-window reads. Drives
 * REAL core resolutions so the durable ledger is the source of truth (the module registry is
 * per-file isolated, so these resolutions don't leak to other suites).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { placeWager, resolveWager } from '../../core/index.js'
import { getBook } from '../../app/book-store.js'
import { settleAndRecord } from '../../app/settlement-store.js'
import {
  rebuild,
  reconcile,
  getProfileStats,
  getPlayerProjection,
  getProjectionVersion,
  subscribeProjection,
  __setProjectionSeed,
  __resetProjection,
} from './projection-store.js'

const NOW = 1_750_000_000_000

beforeEach(() => {
  __resetProjection()
  __setProjectionSeed(false) // off → projection reconciles to the REAL ledger exactly
})

/** Settle one bet through core (fires onWagerResolved → the durable book-ledger). */
function settleBet(accountId: string, stake: number, outcome: 'win' | 'loss', mult?: number): void {
  const acct = getBook().members[accountId].account
  const w = placeWager(acct, stake)
  resolveWager(acct, w, outcome, mult)
}

// The durable ledger is an append-only per-file singleton (no reset), so assert the INVARIANT
// (projection == ledger) + the DELTA of a known bet — both robust to accumulation across tests.
describe('reconciles to the ledger — no inflation', () => {
  it('Σ projection net_cents == ledger net (seeding off), and a bet moves it by exactly its profit', () => {
    const before = reconcile(NOW)
    expect(before.reconciled).toBe(true) // holds for any ledger state, incl. empty

    settleBet('p-marco', 1000, 'win', 2) // +1000
    settleBet('p-lena', 2000, 'loss') // −2000
    settleBet('p-marco', 1500, 'win', 3) // +3000
    rebuild(NOW)

    const after = reconcile(NOW)
    expect(after.reconciled).toBe(true)
    expect(after.projectionNetCents).toBe(after.ledgerNetCents) // the projection invents nothing
    expect(after.projectionNetCents - before.projectionNetCents).toBe(1000 - 2000 + 3000)
  })
})

describe('drop + rebuild is deterministic', () => {
  it('rebuilding the same ledger yields identical blocks', () => {
    settleBet('p-marco', 1000, 'win', 2)
    settleBet('p-marco', 500, 'loss')
    rebuild(NOW)
    const a = getPlayerProjection('p-marco')
    rebuild(NOW) // drop + rebuild
    const b = getPlayerProjection('p-marco')
    expect(a).toEqual(b)
  })
})

describe('per-window reads', () => {
  it('a player’s stats move by exactly the bet (no inflation per player)', () => {
    rebuild(NOW)
    const before = getProfileStats('p-priya', 'all')
    const beforeNet = before?.netCents ?? 0
    const beforeWins = before?.wins ?? 0

    settleBet('p-priya', 1000, 'win', 2)
    rebuild(NOW)
    const after = getProfileStats('p-priya', 'all')!
    expect(after.netCents - beforeNet).toBe(1000)
    expect(after.wins - beforeWins).toBe(1)
  })
})

describe('recompute on settlement', () => {
  it('a settlement event rebuilds the materialized view', () => {
    const off = subscribeProjection(() => {})
    settleBet('p-marco', 1000, 'win', 2)
    rebuild(NOW)
    const v1 = getProjectionVersion()
    settleAndRecord(NOW + 1000) // fires the settlement event → store rebuilds
    expect(getProjectionVersion()).toBeGreaterThan(v1)
    off()
  })
})
