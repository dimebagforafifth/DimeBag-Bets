/**
 * A `SportsbookFeed` backed by the local normalized-lines CACHE — not a vendor
 * (CLAUDE.md §4, §6).
 *
 * This is the read side of the ingestion split: the central poller writes normalized
 * slates into the cache; every player and operator store consumes THIS feed, which only
 * ever reads the cache. So no amount of player traffic can trigger a vendor API call —
 * the budget is spent solely by the one poller.
 *
 * It's generic over the cache: pass any `CacheSource` (snapshot + subscribe, optional
 * health), and the app's persisted lines-cache store satisfies it. `start`/`stop` are
 * no-ops because the cache is fed independently by the poller; the feed just mirrors it.
 */

import type { FeedHealth, GameEvent, SportsbookFeed } from '../sportsbook/index.js'

export interface CacheSource {
  /** The latest normalized slate held in the cache. */
  snapshot(): GameEvent[]
  /** Fire `listener` whenever the cache changes; returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void
  /** Optional connection health from the ingestion poller (drives the live indicator). */
  getHealth?(): FeedHealth
  subscribeHealth?(listener: (h: FeedHealth) => void): () => void
}

export function createCacheFeed(source: CacheSource): SportsbookFeed {
  return {
    snapshot: () => source.snapshot(),
    subscribe(listener) {
      // Re-emit the cache's current slate on every cache change.
      return source.subscribe(() => listener(source.snapshot()))
    },
    getHealth: source.getHealth ? () => source.getHealth!() : undefined,
    subscribeHealth: source.subscribeHealth
      ? (listener) => source.subscribeHealth!(listener)
      : undefined,
    // The poller owns polling; the feed is a passive mirror of the cache.
    start() {},
    stop() {},
  }
}
