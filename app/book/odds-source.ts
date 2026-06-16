/**
 * The book's odds SOURCE — the read side of the SGO cache. A framework-agnostic
 * external store (subscribe / getSnapshot / version), mirrored into React with
 * `useSyncExternalStore` (the same pattern as book-store / the ledger).
 *
 * Today it is seeded from the mock slate (app/book/mockBook.ts). When the FEED
 * lane (Agent 1) is live, `connectOddsCache()` hydrates from the Supabase cache
 * tables (odds_events/odds_markets/odds_selections) and subscribes to realtime
 * postgres_changes, calling `setSlate()` on every push — so the UI never rewrites,
 * only the source flips. See the // SEAM in `connectOddsCache`.
 *
 * The UI ALWAYS reads `priceDisplay` off these selections; it never sees the feed.
 */

import { useSyncExternalStore } from 'react'
import type { NormalizedEvent } from '../../lib/odds/contract.js'
import { mockSlate } from './mockBook.js'

export type OddsSourceKind = 'mock' | 'live'

interface Snapshot {
  events: NormalizedEvent[]
  source: OddsSourceKind
  version: number
}

let events: NormalizedEvent[] = mockSlate()
let source: OddsSourceKind = 'mock'
let version = 0
// Cached snapshot object: useSyncExternalStore requires getSnapshot to return a
// STABLE reference until something actually changes, or it re-renders forever.
let snapshot: Snapshot = { events, source, version }
const listeners = new Set<() => void>()

function emit(): void {
  snapshot = { events, source, version }
  listeners.forEach((l) => l())
}

/** Replace the live slate (the cache connector + tests call this). Bumps the
 *  version so every `useBookOdds()` consumer re-renders. */
export function setSlate(next: NormalizedEvent[], kind: OddsSourceKind = source): void {
  events = next
  source = kind
  version += 1
  emit()
}

/** Reset back to a fresh mock slate (tests). */
export function resetBookOdds(): void {
  events = mockSlate()
  source = 'mock'
  version += 1
  emit()
}

export function subscribeBookOdds(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getBookOddsSnapshot(): Snapshot {
  return snapshot
}

/** Whether the real feed cache is driving the slate (vs the built-in mock). */
export function isLiveOdds(): boolean {
  return source === 'live'
}

/**
 * Connect the Supabase cache as the live source.
 *
 *  // SEAM — depends on the FEED lane (Agent 1) having created + populated
 *  odds_events / odds_markets / odds_selections. When it has, this:
 *    1. SELECTs the current rows, assembles NormalizedEvent[] (joining markets →
 *       selections), and calls setSlate(events, 'live').
 *    2. Subscribes to realtime postgres_changes on those tables and re-assembles
 *       on each push, calling setSlate(...) again.
 *  Until then it is a no-op and the mock slate stays in force, so the book renders
 *  populated. The flip is this one function — no UI change.
 *
 * Returns a disposer.
 */
export function connectOddsCache(): () => void {
  // SEAM: hydrate + subscribe to the Supabase odds cache here once Agent 1 lands.
  // e.g. const ch = supabase.channel('odds').on('postgres_changes', { table: 'odds_selections' }, reload)
  return () => {}
}

/** React hook: the current slate + which source is driving it. */
export function useBookOdds(): Snapshot {
  return useSyncExternalStore(subscribeBookOdds, getBookOddsSnapshot, getBookOddsSnapshot)
}

/** React hook: a single event by id (or null), re-rendering on slate changes. */
export function useBookEvent(eventId: string | null): NormalizedEvent | null {
  const { events: list } = useBookOdds()
  if (!eventId) return null
  return list.find((e) => e.eventId === eventId) ?? null
}
