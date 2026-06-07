/**
 * The durable operator-analytics store (factory).
 *
 * The app's on-screen ledger (app/ledger-store) is session-only and capped — it
 * forgets on reload and keeps only the last N entries. Operator reporting needs the
 * opposite: a permanent, timestamped, uncapped-enough record of every settled wager
 * and bonus, so a manager can look back over any window (retention, churn, hold).
 *
 * This factory holds that durable log. It is fed by `ingest(entries)` with the
 * latest ledger snapshot and appends only the genuinely-new ones (id-monotonic
 * dedupe), persisting through the injected `Doc`. It is PURE of any app/browser
 * wiring — `capture.ts` connects this singleton to the live ledger + localStorage.
 * It never moves money; it only observes what core already settled.
 */

import type { AnalyticsRecord } from './analytics.js'

/** Minimal shape of an app ledger entry this store ingests (structurally
 *  compatible with app/ledger-store's LedgerEntry). */
export interface LedgerLike {
  id: number
  time: number
  accountId: string
  gameKey: string
  game: string
  stake: number
  multiplier: number
  profit: number
  outcome: string
}

/** Persisted document shape (versioned via persistedDoc). */
export interface AnalyticsDoc {
  /** Highest ledger id already ingested — the dedupe high-water mark. */
  lastId: number
  records: AnalyticsRecord[]
}

/** A tiny load/save document seam (a subset of persistence/ `Doc`). */
export interface DocLike<T> {
  load(): T
  save(value: T): void
}

/** Keep the durable log bounded so localStorage can't grow without limit — far
 *  above the session ledger's cap, but not infinite. Oldest are dropped first. */
export const MAX_RECORDS = 50_000

export interface AnalyticsStore {
  /** The durable records, oldest first (stable reference; mutated in place). */
  records(): AnalyticsRecord[]
  /** Append the genuinely-new entries from a ledger snapshot (dedupe by id). */
  ingest(entries: LedgerLike[]): void
  /** Subscribe to appends (for useSyncExternalStore). */
  subscribe(listener: () => void): () => void
  /** A changing snapshot value for useSyncExternalStore. */
  version(): number
  /** Drop all history (operator "reset analytics"). */
  clear(): void
}

function toRecord(e: LedgerLike): AnalyticsRecord {
  return {
    seq: e.id, // the ledger id is already monotonic + unique
    time: e.time,
    accountId: e.accountId,
    gameKey: e.gameKey,
    game: e.game,
    kind: e.gameKey === 'bonus' ? 'bonus' : 'wager',
    stake: e.stake,
    profit: e.profit,
    multiplier: e.multiplier,
    outcome: e.outcome,
  }
}

export function createAnalyticsStore(doc: DocLike<AnalyticsDoc>): AnalyticsStore {
  const state = doc.load()
  const listeners = new Set<() => void>()
  let version = 0

  function notify(): void {
    version += 1
    for (const l of listeners) l()
  }

  return {
    records: () => state.records,

    ingest(entries) {
      // Only entries we haven't seen, applied in id order so `lastId` advances
      // monotonically even if the snapshot arrives newest-first.
      const fresh = entries.filter((e) => e.id > state.lastId).sort((a, b) => a.id - b.id)
      if (fresh.length === 0) return
      for (const e of fresh) {
        state.records.push(toRecord(e))
        if (e.id > state.lastId) state.lastId = e.id
      }
      if (state.records.length > MAX_RECORDS) {
        state.records.splice(0, state.records.length - MAX_RECORDS)
      }
      doc.save(state)
      notify()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    version: () => version,

    clear() {
      state.records = []
      state.lastId = 0
      doc.save(state)
      notify()
    },
  }
}
