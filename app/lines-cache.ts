/**
 * The normalized-lines CACHE (CLAUDE.md §4, §6) — the single source every player and
 * operator store reads, so vendor traffic is decoupled from player traffic.
 *
 * The central ingestion poller (`sportsdata/ingestion`) is the ONLY writer: it pulls a
 * vendor, normalizes to `GameEvent[]`, and calls `ingestSlate` here. The cache persists
 * through the standard seam (`persistence` → Supabase when keys are present, localStorage
 * otherwise — the "realtime cache" the players read), exposes the subscribe/version
 * snapshot `useSyncExternalStore` wants, and hands a `CacheSource` to `createCacheFeed`
 * so a sportsbook store can mirror it. No player read ever reaches the vendor.
 */

import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import type { FeedHealth, GameEvent } from '../sportsbook/index.js'
import { createCacheFeed, type CacheSource } from '../sportsdata/cacheFeed.js'
import type { SportsbookFeed } from '../sportsbook/index.js'

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<GameEvent[]> = persistedDoc<GameEvent[]>(store, 'odds.linesCache', {
  version: 1,
  initial: [],
})

const loaded = DOC.load()
let slate: GameEvent[] = Array.isArray(loaded) ? loaded : []
let health: FeedHealth = { status: slate.length > 0 ? 'live' : 'idle', lastUpdated: null }
let version = 0

const listeners = new Set<() => void>()
const healthListeners = new Set<(h: FeedHealth) => void>()

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

/**
 * Write a freshly normalized slate to the cache. Latest-wins MERGE by event id, so a
 * partial/filtered pull (e.g. a live-only fast feed) updates the games it carries
 * without dropping the rest. Persisted + broadcast to every subscriber.
 */
export function ingestSlate(events: GameEvent[]): void {
  if (events.length === 0) return
  const byId = new Map(slate.map((e) => [e.id, e]))
  for (const e of events) byId.set(e.id, e)
  slate = [...byId.values()]
  DOC.save(slate)
  notify()
}

/** The cached slate (stable reference between ingests). */
export function getCachedSlate(): GameEvent[] {
  return slate
}

export function getLinesCacheVersion(): number {
  return version
}

export function subscribeLinesCache(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Set the cache's connection health (the ingestion poller pushes this through). */
export function setCacheHealth(next: FeedHealth): void {
  health = next
  healthListeners.forEach((l) => l(health))
}

export function getCacheHealth(): FeedHealth {
  return health
}

function subscribeCacheHealth(listener: (h: FeedHealth) => void): () => void {
  healthListeners.add(listener)
  return () => {
    healthListeners.delete(listener)
  }
}

/** Test/reset helper: empty the cache. */
export function clearLinesCache(): void {
  slate = []
  DOC.save(slate)
  notify()
}

/** The CacheSource view of this store, for `createCacheFeed`. */
export const linesCacheSource: CacheSource = {
  snapshot: getCachedSlate,
  subscribe: subscribeLinesCache,
  getHealth: getCacheHealth,
  subscribeHealth: subscribeCacheHealth,
}

/**
 * A `SportsbookFeed` over the cache — drop-in for `createMockFeed()` where a store is
 * created (`createStore(account, { feed: linesCacheFeed() })`). Reads the cache only.
 */
export function linesCacheFeed(): SportsbookFeed {
  return createCacheFeed(linesCacheSource)
}
