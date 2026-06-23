/**
 * The settlement store — the persisted history of squared-up periods (CLAUDE.md §4).
 *
 * `settleOrgWeek` (org/) rolls every figure up to the manager and zeroes the book, and
 * it RETURNS the per-member sheet — which the caller used to discard. This store
 * captures that sheet as a durable `SettlementRecord` so the operator has a permanent
 * record of every settlement: who squared what, the book's net, when it ran, and the
 * cadence it ran under. It also logs the weekly square in the durable book ledger
 * (a 'settle' entry, actor 'operator') and anchors the next settlement date in the
 * settings store.
 *
 * Money still moves only through core (§3): settleBook → settleOrgWeek → core.settleWeek.
 * This module only remembers the result. Same persisted-store blueprint as
 * edge-store/book-store (subscribe + version snapshot, persistedDoc namespace 'dimebag').
 */

import { bookFigure, type Settlement } from '../features/org/index.js'
import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import { formatMoney } from '../games/shared/money.js'
import { getBook, settleBook } from './book-store.js'
import { recordBookEntry } from './book-ledger.js'
import { recordAudit } from './audit-store.js'
import { getSettings, markSettled } from './settings-store.js'

/**
 * One squared-up period: the frozen per-member statement plus the book's net, when it
 * ran, and the cadence it ran under. `collected` is the mark-paid flag (toggled in
 * Phase 1); it ships false.
 */
export interface SettlementRecord {
  id: string
  /** When the settlement ran (epoch ms). */
  generatedAt: number
  /** The settlement cadence (days) this period ran under. */
  periodDays: number
  /** The frozen per-member sheet — who squared what to the level above. */
  lines: Settlement[]
  /** The whole book's net at settlement (the manager's book figure before the reset).
   *  Positive = the book owed the players; negative = the players owed the book. */
  net: number
  /** True if figures were carried forward (a soft close) rather than reset to zero. */
  carriedOver: boolean
  /** Mark-paid tracking: false until the settlement is marked collected. */
  collected: boolean
  /** When it was marked collected (epoch ms); undefined while uncollected. */
  collectedAt?: number
}

/** Build a record from a frozen sheet. Pure (no singletons) — unit-testable. */
export function buildSettlementRecord(
  lines: Settlement[],
  net: number,
  now: number,
  periodDays: number,
  carryover = false,
): SettlementRecord {
  return {
    id: `settle_${now}`,
    generatedAt: now,
    periodDays,
    lines,
    net,
    carriedOver: carryover,
    collected: false,
  }
}

/** Render a settlement record as CSV (the per-member sheet + a header). Pure. */
export function settlementToCsv(record: SettlementRecord): string {
  const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const meta = [
    `Settlement,${cell(record.id)}`,
    `Generated,${new Date(record.generatedAt).toISOString()}`,
    `Net,${cell(formatMoney(record.net))}`, // formatMoney adds thousands commas — must be escaped
    `Carried over,${record.carriedOver ? 'yes' : 'no'}`,
    `Collected,${record.collected ? 'yes' : 'no'}`,
  ]
  const head = ['Member', 'Role', 'Reports to', 'Amount (cents)', 'Amount']
  const rows = record.lines.map((l) =>
    [cell(l.name), l.role, cell(l.parentId ?? ''), String(l.amount), cell(formatMoney(l.amount))].join(','),
  )
  return [...meta, '', head.join(','), ...rows].join('\n')
}

const store = createStore({ namespace: 'dimebag' })
const HISTORY_DOC: Doc<SettlementRecord[]> = persistedDoc<SettlementRecord[]>(
  store,
  'settlement.history',
  { version: 1, initial: [] },
)

const loaded = HISTORY_DOC.load()
const history: SettlementRecord[] = Array.isArray(loaded) ? loaded : []
const listeners = new Set<() => void>()
let version = 0
// Stable, newest-first snapshot for useSyncExternalStore.
let snapshot: SettlementRecord[] = [...history].reverse()

function notify(): void {
  snapshot = [...history].reverse()
  version += 1
  listeners.forEach((l) => l())
}

/* -------------------------------- the API ------------------------------- */

export function subscribeSettlements(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSettlementsVersion(): number {
  return version
}

/** Past settlements, newest first (stable reference between changes). */
export function getSettlementHistory(): SettlementRecord[] {
  return snapshot
}

/**
 * Settle the whole book for the period and RECORD it: roll figures up + zero the book
 * (settleBook → settleOrgWeek → core.settleWeek), capture the frozen sheet as a
 * SettlementRecord in the persisted history, log a 'settle' entry in the durable
 * ledger, and anchor the next settlement date. Throws (recording nothing) if any
 * wager is still pending. Returns the record.
 */
export function settleAndRecord(now: number, carryover = false): SettlementRecord {
  const book = getBook()
  const net = bookFigure(book, book.managerId) // the whole-book net BEFORE the reset
  const lines = settleBook(carryover) // mutates (unless carryover) + persists; throws if pending
  // From here any money reset is already applied AND persisted in the book. The steps
  // below only RECORD it (history + audit ledger + period anchor); ordered record-first
  // so a later localStorage failure loses the record/anchor, never the (correct) figures.
  const record = buildSettlementRecord(lines, net, now, getSettings().settlementPeriodDays, carryover)
  history.push(record)
  HISTORY_DOC.save(history)
  // A hard settle moves the manager's figure to 0; a carryover moves no money, so it
  // gets no ledger 'settle' entry (the audit entry below still records that it ran).
  if (!carryover) {
    recordBookEntry({
      kind: 'settle',
      accountId: book.managerId,
      balanceDelta: -net,
      pendingDelta: 0,
      balanceAfter: 0,
      pendingAfter: 0,
      actor: 'operator',
      reason: `settlement ${record.id}`,
      at: now,
    })
  }
  markSettled(now)
  recordAudit({
    actor: 'operator',
    action: 'settle',
    memberId: '',
    memberName: 'Whole book',
    detail: carryover
      ? `Soft close (carryover) — net ${formatMoney(net)} carried forward (${lines.length} members)`
      : `Settled the week — net ${formatMoney(net)} (${lines.length} members)`,
    at: now,
  })
  notify()
  return record
}

/** Flip a recorded settlement's collected (paid) flag, with a timestamp + audit entry. */
export function markCollected(id: string, collected: boolean, at = Date.now()): void {
  const rec = history.find((r) => r.id === id)
  if (!rec) throw new Error(`no settlement ${id}`)
  rec.collected = collected
  rec.collectedAt = collected ? at : undefined
  HISTORY_DOC.save(history)
  recordAudit({
    actor: 'operator',
    action: 'collect',
    memberId: '',
    memberName: 'Whole book',
    detail: `Settlement ${id} marked ${collected ? 'collected' : 'uncollected'}`,
    at,
  })
  notify()
}
