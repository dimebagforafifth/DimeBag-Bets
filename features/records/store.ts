/**
 * The records store — a READ-ONLY bridge from the live ledger to verified records.
 *
 * It subscribes to the durable ledger + the book (for player switching) and recomputes a
 * record on demand. It holds NO money, persists nothing of its own, and exposes no mutator —
 * a record is always a fresh projection of whatever the ledger currently says. The only state
 * here is a version counter for React's useSyncExternalStore.
 */

import { toBetRows } from '../../app/ledger-stats.js'
import { getBookLedger, subscribeBookLedger } from '../../app/book-ledger.js'
import { getBook, listPlayers, subscribeBook } from '../../app/book-store.js'
import { getVipConfig } from '../../app/vip-store.js'
import { rankProgress } from '../vip/index.js'
import { buildRecord } from './record.js'
import { hasSeed, seededAccountIds, seededClv, seededRows } from './seed.js'
import type { ClvDatum, VerifiedRecord } from './types.js'

/**
 * Demo seeding is the mock/local default (so every profile renders populated). A real, keyed
 * deployment turns this OFF so records derive purely from the server-authoritative ledger —
 * the wiring pass / production flips this once the backend is the source of truth. SEAM.
 */
let seedEnabled = true

/**
 * Real closing-line data per account — none captured in the ledger today (CLV is gated honest
 * in clvSummary). Production fills this from server-side closing-line snapshots. SEAM.
 */
function realClv(_accountId: string): ClvDatum[] {
  return []
}

function displayName(accountId: string): string {
  const m = getBook().members[accountId]
  return m?.profile?.nickname || m?.name || accountId
}

/** Build the verified record for an account from the live ledger (+ demo seed when enabled). */
export function getRecord(accountId: string, now: number): VerifiedRecord {
  const realRows = toBetRows(getBookLedger(), accountId)
  const seeded = seedEnabled ? seededRows(accountId, now) : []
  const rows = [...realRows, ...seeded]
  const clv = [...realClv(accountId), ...(seedEnabled ? seededClv(accountId, now) : [])]
  return buildRecord(
    { accountId, name: displayName(accountId), rows, clv, now, demoSeeded: seeded.length > 0 },
    (wagered) => rankProgress(wagered, getVipConfig()),
  )
}

/** Players that have a viewable profile (org players ∪ any seeded demo ids). */
export function listProfilePlayers(): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = []
  const seen = new Set<string>()
  for (const m of listPlayers()) {
    seen.add(m.id)
    out.push({ id: m.id, name: m.profile?.nickname || m.name })
  }
  if (seedEnabled) {
    for (const id of seededAccountIds()) {
      if (!seen.has(id)) {
        seen.add(id)
        out.push({ id, name: displayName(id) })
      }
    }
  }
  return out
}

/** True if the account's record currently includes seeded demo rows (UI surfaces this). */
export function isDemoProfile(accountId: string): boolean {
  return seedEnabled && hasSeed(accountId)
}

// ── React store plumbing (version counter over the upstream read-only sources) ──
let version = 0
const listeners = new Set<() => void>()
let wired = false

function bump(): void {
  version++
  for (const l of listeners) l()
}

function ensureWired(): void {
  if (wired) return
  wired = true
  subscribeBookLedger(bump) // new settled bets → records change
  subscribeBook(bump) // player switch / roster change
}

export function subscribeRecords(listener: () => void): () => void {
  ensureWired()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getRecordsVersion(): number {
  return version
}

// ── Test helpers ──
export function __setRecordsSeed(enabled: boolean): void {
  seedEnabled = enabled
}

export function __resetRecords(): void {
  seedEnabled = true
}
