/**
 * The book ledger — the DURABLE, persisted transaction history for the whole book.
 *
 * The canonical record (CLAUDE.md §3): money still flows only through `core`; this
 * just remembers every movement with the running before/after figure. It's built on
 * the generic `ledger/` module (`createLedger`) and persisted via `persistence/`, so
 * it SURVIVES reloads — unlike the on-screen casino feed (app/ledger-store.ts), which
 * is a session-only, anti-spoiler-timed UI feed. This is the base for durable
 * per-player history, settlement records, and the manager audit trail (manual settles
 * and figure adjustments carry an `actor` + `reason`).
 *
 * It captures every resolution by subscribing to core's `onWagerResolved` (so no game
 * needs to know it exists). Recording is pure bookkeeping — it NEVER engages the
 * cross-game "resolving" lock, so the next bet is never throttled (the invariant in
 * app/ledger-no-throttle.test.ts).
 */

import { onWagerPlaced, onWagerResolved, type PlaceEvent, type ResolveEvent } from '../core/index.js'
import { createLedger, type Ledger, type LedgerEntry } from '../ledger/index.js'
import { createLocalStore, persistedDoc, type Doc } from '../persistence/index.js'
import { getBook } from './book-store.js'
import { getActiveGame } from './ledger-store.js'

/** Keep the most-recent N entries on disk so localStorage can't grow without bound
 *  (the durable record; a real backend later removes this ceiling). */
const MAX_PERSISTED = 1000

type NewEntry = Omit<LedgerEntry, 'seq' | 'at'> & { at?: number }

/**
 * Build a durable 'resolve' entry from a core resolution event + the player's
 * post-resolution account figure. Pure (no singletons) so it's unit-testable.
 */
export function resolveEntry(
  e: ResolveEvent,
  account: { balance: number; pending: number } | undefined,
  game: { key: string; name: string },
): NewEntry {
  return {
    kind: 'resolve',
    accountId: e.accountId,
    balanceDelta: e.profit,
    pendingDelta: -e.stake, // the placement hold is released on resolve
    balanceAfter: account?.balance ?? 0,
    pendingAfter: account?.pending ?? 0,
    outcome: e.outcome,
    multiplier: e.payoutMultiplier,
    meta: { game: game.key, gameName: game.name, stake: e.stake },
  }
}

const store = createLocalStore({ namespace: 'dimebag' })
const LOG_DOC: Doc<LedgerEntry[]> = persistedDoc<LedgerEntry[]>(store, 'ledger.log', {
  version: 1,
  initial: [],
})

const listeners = new Set<() => void>()
let version = 0
// A stable, newest-first snapshot for useSyncExternalStore (rebuilt only on change,
// so getBookLedger() returns the same reference between movements — no render loop).
let snapshot: LedgerEntry[] = []

function notify(): void {
  snapshot = ledger.entries().reverse()
  version += 1
  listeners.forEach((l) => l())
}

// The durable ledger, rehydrated from disk (trimmed to the cap on load too, and
// guarded against a corrupt non-array doc). onRecord re-trims, persists, and notifies
// after every recorded movement, so the cap invariant holds at all times.
const storedLog = LOG_DOC.load()
const ledger: Ledger = createLedger({
  initial: Array.isArray(storedLog) ? storedLog.slice(-MAX_PERSISTED) : [],
  onRecord: (_entry, log) => {
    if (log.length > MAX_PERSISTED) log.splice(0, log.length - MAX_PERSISTED)
    LOG_DOC.save(log)
    notify()
  },
})
snapshot = ledger.entries().reverse() // initial snapshot from the rehydrated log

// Attribute each bet to the product it was PLACED on, not whatever screen is active
// when it grades — so an async sportsbook bet that settles while a casino game is open
// still lands in the right per-game row. We capture the active game at PLACE time
// (keyed by wagerId) and look it up at resolve (falling back to the active game for a
// bet placed before this listener existed).
const placeGame = new Map<string, { key: string; name: string }>()
onWagerPlaced((e: PlaceEvent) => {
  placeGame.set(e.wagerId, getActiveGame())
})

// Capture every resolution durably. The account is already fully mutated when core
// emits (resolveWager/resolveAtMultiplier update it BEFORE emitResolved), so the live
// book holds the true AFTER figure. This relies on resolve listeners staying READ-ONLY
// w.r.t. the account — none of the peers mutate it (book-store persists, vip-store
// accrues VIP points, ledger-store records a UI entry). Pure bookkeeping: no reveal /
// resolving-lock interaction, so betting is never throttled.
onWagerResolved((e: ResolveEvent) => {
  const account = getBook().members[e.accountId]?.account
  const game = placeGame.get(e.wagerId) ?? getActiveGame()
  placeGame.delete(e.wagerId)
  ledger.record(resolveEntry(e, account, game))
})

/* -------------------------------- the API ------------------------------- */

/** The durable log, newest first (stable reference between changes). Consumers
 *  filter by accountId in render (cheap), like the session feed. */
export function getBookLedger(): LedgerEntry[] {
  return snapshot
}

export function subscribeBookLedger(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Monotonic snapshot id for useSyncExternalStore. */
export function getBookLedgerVersion(): number {
  return version
}

/**
 * Record an audited manual movement — a settlement reset or a figure adjustment.
 * The figure itself must already have moved through `core`; this only records it,
 * with `actor` + `reason`, for the durable history + audit trail. Used by the
 * settlement and manual-adjustment flows (Phase 1).
 */
export function recordBookEntry(entry: NewEntry): LedgerEntry {
  return ledger.record(entry)
}
