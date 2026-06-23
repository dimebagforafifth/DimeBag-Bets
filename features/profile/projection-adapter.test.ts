/**
 * Adapter reconciliation — the records-backed projection source. The cardinal rule: the
 * independently-computed P&L curve must reconcile to the record's net (last point === net), and
 * units must match an independent recomputation from the same settled rows. by-sport reflects the
 * player's live settled bets. No money moves anywhere here.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { toBetRows } from '../../app/ledger-stats.js'
import { getBookLedger } from '../../app/book-ledger.js'
import { __resetBets, recordBet, type BookBet } from '../../app/book/bets-store.js'
import {
  __resetRecords,
  getRecord,
  isDemoProfile,
  seededAccountIds,
  seededRows,
} from '../records/index.js'
import { recordsBackedSource } from './projection-adapter.js'
import { unitsFromRows } from './derive.js'

const NOW = 1_700_000_000_000

beforeEach(() => {
  __resetRecords()
  __resetBets()
})
afterEach(() => {
  __resetBets()
})

function aSeededAccount(): string {
  const ids = seededAccountIds()
  expect(ids.length).toBeGreaterThan(0)
  return ids[0]
}

describe('records-backed projection source', () => {
  it('lists seeded profiles', () => {
    const id = aSeededAccount()
    expect(recordsBackedSource.listProfiles().some((p) => p.id === id)).toBe(true)
  })

  it('the P&L curve reconciles to the record net (last cumulative === netCents)', () => {
    const id = aSeededAccount()
    const stats = recordsBackedSource.statsFor(id, NOW)
    const rec = getRecord(id, NOW)
    expect(stats.netCents).toBe(rec.lifetime.net)
    expect(stats.pnl.length).toBeGreaterThan(0)
    expect(stats.pnl[stats.pnl.length - 1].cumulative).toBe(stats.netCents)
  })

  it('units match an independent recomputation from the same settled rows', () => {
    const id = aSeededAccount()
    const stats = recordsBackedSource.statsFor(id, NOW)
    const rows = [
      ...toBetRows(getBookLedger(), id),
      ...(isDemoProfile(id) ? seededRows(id, NOW) : []),
    ]
    expect(stats.units).toBeCloseTo(unitsFromRows(rows), 9)
  })

  it('by-sport reflects the player’s settled book bets (where data exists)', () => {
    const id = aSeededAccount()
    const settled: BookBet = {
      id: 'bb1',
      accountId: id,
      playerName: 'P',
      placedBy: 'P',
      mode: 'single',
      legs: [
        {
          key: 'k',
          eventId: 'e',
          eventLabel: 'A @ B',
          leagueId: 'l',
          marketId: 'm',
          marketType: 'moneyline',
          marketPeriod: 'game',
          side: 'home',
          pick: 'Home',
          price: { american: -110, decimal: 1.91 },
          sport: 'HOCKEY',
        },
      ],
      stakeCents: 1000,
      decimal: 1.91,
      status: 'won',
      placedAt: NOW,
      settledAt: NOW,
      returnCents: 1910,
    }
    recordBet(settled)
    const stats = recordsBackedSource.statsFor(id, NOW)
    const hockey = stats.bySport.find((s) => s.key === 'HOCKEY')
    expect(hockey).toBeTruthy()
    expect(hockey!.net).toBe(910) // 1910 − 1000
  })

  it('tail-success is honestly gated until tail provenance lands (// SEAM)', () => {
    const stats = recordsBackedSource.statsFor(aSeededAccount(), NOW)
    expect(stats.tailSuccess.available).toBe(false)
  })
})
