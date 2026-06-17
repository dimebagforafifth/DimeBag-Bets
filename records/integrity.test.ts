import { describe, expect, it } from 'vitest'
import { getBookLedger } from '../app/book-ledger.js'
import { getBook } from '../app/book-store.js'
import * as records from './index.js'
import { buildRecord } from './record.js'
import { __setRecordsSeed, getRecord } from './store.js'
import type { BetRow, RecordInput } from './types.js'

const NOW = 1_700_000_000_000

function balancesSnapshot(): string {
  return JSON.stringify(
    Object.values(getBook().members)
      .map((m) => [m.id, m.account.balance, m.account.pending])
      .sort(),
  )
}

describe('integrity — the record is a read-only projection, never a write path', () => {
  it('building a record does NOT mutate the ledger or any account', () => {
    const ledgerBefore = getBookLedger().length
    const balancesBefore = balancesSnapshot()
    // Read records for several players, including a seeded whale.
    for (const id of ['p-dana', 'p-marco', 'p-lena']) getRecord(id, NOW)
    expect(getBookLedger().length).toBe(ledgerBefore)
    expect(balancesSnapshot()).toBe(balancesBefore)
  })

  it('exposes NO money/inflation mutator on its public surface', () => {
    for (const banned of [
      'placeWager',
      'resolveWager',
      'resolveAtMultiplier',
      'grant',
      'adjustBalance',
      'adjustFigure',
      'setBalance',
      'recordWin',
      'addBet',
      'mutateBook',
    ]) {
      expect(records).not.toHaveProperty(banned)
    }
  })

  it('a losing history can NOT be inflated — the only input is settled rows', () => {
    const losses: BetRow[] = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      accountId: 'p',
      gameKey: 'dice',
      game: 'Dice',
      stake: 1000,
      multiplier: 0,
      profit: -1000,
      outcome: 'loss',
      time: NOW - i * 1000,
    }))
    const input: RecordInput = {
      accountId: 'p',
      name: 'L',
      rows: losses,
      clv: [],
      now: NOW,
      demoSeeded: false,
    }
    const rec = buildRecord(input, () => ({
      current: {
        id: 'none',
        name: 'Unranked',
        color: '#777',
        minWagered: 0,
        freePlayReward: 0,
        perks: [],
      },
      next: null,
      pct: 0,
      remaining: 0,
    }))
    expect(rec.lifetime.net).toBeLessThan(0)
    expect(rec.lifetime.roi).toBeLessThan(0)
    expect(rec.badges.map((b) => b.id)).not.toContain('in-profit')
    // There is no setter to turn this positive — a win would require a real settled BetRow.
  })

  it('honestly flags demo vs real provenance via integrity.demoSeeded', () => {
    const seeded = getRecord('p-dana', NOW)
    expect(seeded.integrity.demoSeeded).toBe(true)
    expect(seeded.integrity.source).toBe('settled-ledger')

    __setRecordsSeed(false)
    const real = getRecord('p-dana', NOW)
    expect(real.integrity.demoSeeded).toBe(false)
    __setRecordsSeed(true)
  })
})
