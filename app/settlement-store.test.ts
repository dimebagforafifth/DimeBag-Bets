import { describe, it, expect } from 'vitest'
import { adjustBalance, placeWager } from '../core/index.js'
import { bookFigure, type Settlement } from '../org/index.js'
import { getBook } from './book-store.js'
import { getBookLedger } from './book-ledger.js'
import { getAuditLog } from './audit-store.js'
import { getSettings } from './settings-store.js'
import {
  buildSettlementRecord,
  getSettlementHistory,
  markCollected,
  settleAndRecord,
  settlementToCsv,
} from './settlement-store.js'

describe('settlement record (pure builder)', () => {
  it('freezes the sheet + net into a record', () => {
    const lines: Settlement[] = [{ memberId: 'm', name: 'M', role: 'manager', parentId: null, amount: 500 }]
    expect(buildSettlementRecord(lines, 500, 123, 7)).toEqual({
      id: 'settle_123',
      generatedAt: 123,
      periodDays: 7,
      lines,
      net: 500,
      carriedOver: false,
      collected: false,
    })
  })

  it('renders a record to CSV (escaping commas in names)', () => {
    const lines: Settlement[] = [{ memberId: 'p', name: 'Marco, Jr', role: 'player', parentId: 'a', amount: -4500 }]
    const csv = settlementToCsv(buildSettlementRecord(lines, -4500, 123, 7))
    expect(csv).toContain('Settlement,settle_123')
    expect(csv).toContain('"Marco, Jr"') // comma-escaped cell
    expect(csv).toContain('player')
  })
})

// Integration against the live singletons (memory-backed outside the browser), so
// these run in declared order.
describe('settleAndRecord — settle + persist + audit + anchor', () => {
  it('zeroes the book, records the frozen sheet, logs the settle, and anchors the period', () => {
    const book = getBook()
    const net = bookFigure(book, book.managerId) // the seeded book net, before reset
    const memberCount = Object.keys(book.members).length
    const before = getSettlementHistory().length
    const now = 1_700_000_000_000

    const rec = settleAndRecord(now)

    // every figure squared to zero
    for (const m of Object.values(getBook().members)) expect(m.account.balance).toBe(0)
    // the record froze the net + the full per-member sheet
    expect(rec.net).toBe(net)
    expect(rec.generatedAt).toBe(now)
    expect(rec.collected).toBe(false)
    expect(rec.lines).toHaveLength(memberCount)
    // persisted history, newest first
    expect(getSettlementHistory()).toHaveLength(before + 1)
    expect(getSettlementHistory()[0].id).toBe(rec.id)
    // the next settlement date is anchored in settings
    expect(getSettings().lastSettledAt).toBe(now)
    // the durable ledger logged the weekly square for the manager
    expect(getBookLedger()[0]).toMatchObject({
      kind: 'settle',
      accountId: book.managerId,
      balanceDelta: -net,
      actor: 'operator',
    })
    // and the operator audit trail records the settlement
    expect(getAuditLog()[0]).toMatchObject({ action: 'settle', actor: 'operator' })
  })

  it('carryover records the standings WITHOUT resetting figures or moving money', () => {
    const player = Object.values(getBook().members).find((m) => m.role === 'player')!
    adjustBalance(player.account, 7000) // a non-zero figure to carry forward
    const ledgerBefore = getBookLedger().length
    const histBefore = getSettlementHistory().length

    const rec = settleAndRecord(1_700_000_100_000, true)

    expect(rec.carriedOver).toBe(true)
    expect(player.account.balance).toBe(7000) // carried forward, NOT zeroed
    expect(getBookLedger()).toHaveLength(ledgerBefore) // no 'settle' ledger entry (no money moved)
    expect(getSettlementHistory()).toHaveLength(histBefore + 1)
    expect(getAuditLog()[0]).toMatchObject({ action: 'settle' }) // still audited
  })

  it('marks a settlement collected with a timestamp + audit', () => {
    const rec = getSettlementHistory()[0]
    expect(rec.collected).toBe(false)
    markCollected(rec.id, true, 123)
    const updated = getSettlementHistory().find((r) => r.id === rec.id)!
    expect(updated.collected).toBe(true)
    expect(updated.collectedAt).toBe(123)
    expect(getAuditLog()[0]).toMatchObject({ action: 'collect' })
  })

  it('markCollected throws on an unknown settlement id', () => {
    expect(() => markCollected('no-such-settlement', true)).toThrow(/no settlement/)
  })

  it('refuses to settle (recording NOTHING) while a wager is still pending', () => {
    const player = Object.values(getBook().members).find((m) => m.role === 'player')!
    placeWager(player.account, 1000) // a live hold
    const histBefore = getSettlementHistory().length
    const ledgerBefore = getBookLedger().length
    const anchorBefore = getSettings().lastSettledAt
    expect(() => settleAndRecord(2_000_000_000_000)).toThrow(/pending/)
    // the throw is atomic: no record, no 'settle' ledger entry, no period re-anchor
    expect(getSettlementHistory()).toHaveLength(histBefore)
    expect(getBookLedger()).toHaveLength(ledgerBefore)
    expect(getSettings().lastSettledAt).toBe(anchorBefore)
  })
})
