/**
 * The audit log — a persisted, append-only record of MANUAL operator changes to the
 * book (CLAUDE.md §4 "Audit & security"): who changed what, when, and old→new. This is
 * distinct from the money ledger (app/book-ledger, which records figure MOVEMENTS): the
 * audit log records operator ACTIONS — credit-limit changes, locks, suspends, max-bet
 * edits, renames, moves, removals, manual figure adjustments, and settlements.
 *
 * Same persisted-store blueprint as edge-store/settlement-store (subscribe + version
 * snapshot, persistedDoc namespace 'dimebag'). It captures no money — it just remembers.
 */

import { createLocalStore, persistedDoc, type Doc } from '../persistence/index.js'

export interface AuditEntry {
  id: number
  /** Epoch ms when the change was made. */
  at: number
  /** Who made it — a staff/operator id ('operator' until real auth lands). */
  actor: string
  /** Machine action key: credit | lock | active | maxbet | rename | move | add |
   *  remove | adjust | settle | bulk. */
  action: string
  /** The member affected ('' for book-wide actions like a settlement). */
  memberId: string
  memberName: string
  /** Human summary, including old→new where applicable (e.g. "Credit limit $20 → $30"). */
  detail: string
}

/** A draft entry — id + timestamp are stamped on record. */
export type AuditDraft = Omit<AuditEntry, 'id' | 'at'> & { at?: number }

/** Keep the most-recent N on disk so localStorage can't grow without bound. */
const MAX = 2000

const store = createLocalStore({ namespace: 'dimebag' })
const DOC: Doc<AuditEntry[]> = persistedDoc<AuditEntry[]>(store, 'audit.log', {
  version: 1,
  initial: [],
})

const loaded = DOC.load()
const log: AuditEntry[] = Array.isArray(loaded) ? loaded.slice(-MAX) : []
let seq = log.reduce((mx, e) => Math.max(mx, e.id), 0)
const listeners = new Set<() => void>()
let version = 0
// Stable, newest-first snapshot for useSyncExternalStore.
let snapshot: AuditEntry[] = [...log].reverse()

function notify(): void {
  snapshot = [...log].reverse()
  version += 1
  listeners.forEach((l) => l())
}

/** Append an audited change. id + timestamp are stamped here; persisted + notified. */
export function recordAudit(draft: AuditDraft): AuditEntry {
  const entry: AuditEntry = { ...draft, id: ++seq, at: draft.at ?? Date.now() }
  log.push(entry)
  if (log.length > MAX) log.splice(0, log.length - MAX)
  DOC.save(log)
  notify()
  return entry
}

/** The audit trail, newest first (stable reference between changes). Consumers filter
 *  by member in render (the stable ref keeps useSyncExternalStore from looping). */
export function getAuditLog(): AuditEntry[] {
  return snapshot
}

export function subscribeAudit(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getAuditVersion(): number {
  return version
}
