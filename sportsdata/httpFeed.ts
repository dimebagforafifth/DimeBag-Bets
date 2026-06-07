/**
 * A real `SportsbookFeed` (sportsbook/provider) backed by an HTTP odds/scores
 * API. This is the concrete "attach an API" piece the seam was built for: poll
 * the vendor, map the DTO into `GameEvent`s, and push updates to subscribers —
 * the store, pricing, live model, and UI work unchanged.
 *
 * `fetchSlate` is injected (returns the raw `ApiEvent[]`), so this is fully
 * testable without a network and vendor-agnostic. Wire it in by swapping
 * `createMockFeed()` for `createHttpFeed({ fetchSlate: fetchJsonSlate(url) })`
 * where the store is created.
 */

import type { GameEvent } from '../sportsbook/index.js'
import type { FeedHealth, SportsbookFeed } from '../sportsbook/index.js'
import { mapSlate, type MapOptions } from './map.js'
import type { ApiEvent } from './types.js'

export interface HttpFeedOptions extends MapOptions {
  /** Pull the current raw slate from the vendor. Injected for testability. */
  fetchSlate: () => Promise<ApiEvent[]>
  /** Poll cadence once `start()`ed. Default 15s (typical odds-API budget). */
  intervalMs?: number
  /** Notified on a failed poll; the last good snapshot is kept. */
  onError?: (err: unknown) => void
}

/** A feed plus a manual `refresh()` (used internally by the poll loop; handy in
 *  tests to pull once without a timer). */
export interface HttpFeed extends SportsbookFeed {
  refresh(): Promise<void>
}

export function createHttpFeed(opts: HttpFeedOptions): HttpFeed {
  const intervalMs = opts.intervalMs ?? 15000
  let slate: GameEvent[] = []
  let timer: ReturnType<typeof setInterval> | null = null
  // A monotonic token tags each poll. Only the latest-issued poll may apply its
  // result, so an out-of-order or slow response can't overwrite fresher data,
  // and `stop()` bumps it to discard anything still in flight.
  let generation = 0
  const listeners = new Set<(events: GameEvent[]) => void>()
  const healthListeners = new Set<(h: FeedHealth) => void>()
  const emit = () => listeners.forEach((l) => l(slate))

  let health: FeedHealth = { status: 'idle', lastUpdated: null }
  const setHealth = (next: FeedHealth) => {
    health = next
    healthListeners.forEach((l) => l(health))
  }

  async function refresh(): Promise<void> {
    const mine = ++generation
    try {
      const raw = await opts.fetchSlate()
      if (mine !== generation) return // a newer poll started, or we were stopped
      slate = mapSlate(raw, { bookmaker: opts.bookmaker })
      emit()
      setHealth({ status: 'live', lastUpdated: Date.now() })
    } catch (err) {
      if (mine !== generation) return // stale error from a superseded/stopped poll
      opts.onError?.(err) // keep the last good slate on a failed poll
      // Downgrade gently: 'reconnecting' if we'd connected before, else 'error'.
      setHealth({
        status: health.lastUpdated != null ? 'reconnecting' : 'error',
        lastUpdated: health.lastUpdated,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    refresh,
    snapshot: () => slate.slice(), // copy-on-read: callers can't corrupt internal state
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getHealth: () => health,
    subscribeHealth(listener) {
      healthListeners.add(listener)
      return () => healthListeners.delete(listener)
    },
    start() {
      if (timer != null || typeof setInterval === 'undefined') return
      if (health.lastUpdated == null) setHealth({ status: 'connecting', lastUpdated: null })
      void refresh() // pull immediately, then on the interval
      timer = setInterval(() => void refresh(), intervalMs)
    },
    stop() {
      generation += 1 // invalidate any in-flight poll so it can't emit after stop
      if (timer != null) clearInterval(timer)
      timer = null
      setHealth({ status: 'idle', lastUpdated: health.lastUpdated })
    },
  }
}

/**
 * Build a `fetchSlate` that GETs JSON from a URL — the production default. Throws
 * if `fetch` is unavailable (Node without polyfill); inject your own otherwise.
 */
export function fetchJsonSlate(url: string, init?: RequestInit): () => Promise<ApiEvent[]> {
  return async () => {
    if (typeof fetch === 'undefined') throw new Error('fetch is not available in this environment')
    const res = await fetch(url, init)
    if (!res.ok) throw new Error(`odds feed responded ${res.status}`)
    return (await res.json()) as ApiEvent[]
  }
}
