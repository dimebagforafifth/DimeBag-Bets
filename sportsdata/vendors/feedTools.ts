/**
 * Feed composition tools (CLAUDE.md §4, §6).
 *
 * Live odds move far faster than pre-match prices, but the odds-API budget is
 * finite — so a real book polls in-play games every few seconds and the upcoming
 * board every half-minute. These helpers let you do that on top of the existing
 * `createHttpFeed` without changing it:
 *
 *   - `filterSlate` narrows a `fetchSlate` to live-only or upcoming-only events,
 *     so you can build two feeds with different cadences;
 *   - `combineFeeds` merges several `SportsbookFeed`s into one (union by event
 *     id) that the store consumes as a single feed.
 *
 *   const live = createHttpFeed({ fetchSlate: filterSlate(slate, isLiveApi),     intervalMs: 4000 })
 *   const pre  = createHttpFeed({ fetchSlate: filterSlate(slate, isUpcomingApi), intervalMs: 30000 })
 *   const feed = combineFeeds(live, pre)   // → createStore(account, { feed })
 */

import type { GameEvent, SportsbookFeed } from '../../sportsbook/index.js'
import type { ApiEvent } from '../types.js'

/** A live game: it has a running score and isn't completed (or says so directly). */
export function isLiveApi(e: ApiEvent): boolean {
  if (e.status) return e.status === 'live'
  if (e.completed) return false
  return !!e.scores && e.scores.length > 0
}

/** A pre-match game: not started, no score yet. */
export function isUpcomingApi(e: ApiEvent): boolean {
  if (e.status) return e.status === 'upcoming'
  return !e.completed && (!e.scores || e.scores.length === 0)
}

/** Wrap a `fetchSlate` to keep only the events matching `keep`. */
export function filterSlate(
  fetchSlate: () => Promise<ApiEvent[]>,
  keep: (e: ApiEvent) => boolean,
): () => Promise<ApiEvent[]> {
  return async () => (await fetchSlate()).filter(keep)
}

/**
 * Merge several feeds into one. The combined snapshot is the union of each
 * feed's events by id (later feeds win on a clash — list your fast/live feed
 * last so its fresher prices override the slow board). An update from any feed
 * re-emits the merged slate; `start`/`stop` fan out to all.
 */
export function combineFeeds(...feeds: SportsbookFeed[]): SportsbookFeed {
  const listeners = new Set<(events: GameEvent[]) => void>()
  const unsubs: Array<() => void> = []
  let started = false

  const merged = (): GameEvent[] => {
    const byId = new Map<string, GameEvent>()
    for (const feed of feeds) for (const ev of feed.snapshot()) byId.set(ev.id, ev)
    return [...byId.values()]
  }
  const emit = () => {
    const slate = merged()
    listeners.forEach((l) => l(slate))
  }

  return {
    snapshot: merged,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start() {
      if (started) return // idempotent — don't double-wire child subscriptions
      started = true
      for (const feed of feeds) unsubs.push(feed.subscribe(emit))
      for (const feed of feeds) feed.start()
    },
    stop() {
      started = false
      for (const u of unsubs.splice(0)) u()
      for (const feed of feeds) feed.stop()
    },
  }
}
