/**
 * The sportsbook data-feed seam (CLAUDE.md §4, §6 — the integration boundary).
 *
 * Everything in the sportsbook reads events from a `SportsbookFeed` and never
 * cares where they come from. Today the only implementation is the mock feed
 * (mockFeed.ts), which simulates games going live and final on a timer. When the
 * real odds/scores API arrives, implement THIS interface against it and pass it
 * to `createStore` — no other file changes. That is the whole point of the seam:
 * the book already "changes based on active games"; the API just becomes the
 * thing that decides which games are active.
 *
 * A conforming feed must:
 *  - return the current slate from `snapshot()` (events with live status/score),
 *  - push a fresh slate to every `subscribe` listener whenever anything moves
 *    (a score ticks, a game goes live, a game finals, odds shift),
 *  - flip an event's `status` to `final` and set its `score` to the official
 *    result when the game ends — that is what triggers settlement upstream.
 */

import type { GameEvent } from './markets.js'

/**
 * Connection lifecycle of a feed, for the UI to show whether prices are flowing:
 *  - idle: not started yet (or stopped)
 *  - connecting: opened, waiting on the first confirmed slate
 *  - live: receiving updates normally
 *  - reconnecting: a poll failed but we had data before — last prices held
 *  - error: never connected successfully
 */
export type FeedStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error'

/** A feed's health snapshot: where the connection is + how fresh the data is. */
export interface FeedHealth {
  status: FeedStatus
  /** ms-epoch of the last confirmed slate, or null if none has arrived yet. */
  lastUpdated: number | null
  /** Human-readable last error, when status is 'reconnecting' | 'error'. */
  error?: string
}

export interface SportsbookFeed {
  /** The current slate — events with their live status and scores. */
  snapshot(): GameEvent[]
  /** Listen for updates; returns an unsubscribe fn. Called with the new slate. */
  subscribe(listener: (events: GameEvent[]) => void): () => void
  /** Begin emitting updates (e.g. open the socket / start the poll loop). */
  start(): void
  /** Stop emitting and release resources. */
  stop(): void
  /**
   * OPTIONAL connection-health channel for the UI. A feed that omits these is
   * treated as always-`live` by the store, so existing feeds keep working; a
   * real API implements them to drive the "Live / Connecting / Reconnecting"
   * indicator and the loading state.
   */
  getHealth?(): FeedHealth
  subscribeHealth?(listener: (health: FeedHealth) => void): () => void
}
