/**
 * The sportsbook store (CLAUDE.md §3, §4) — the live state container that sits
 * between a `SportsbookFeed` and the UI. It owns no points; it places bets and
 * settles them through `core`.
 *
 * Responsibilities:
 *  - hold the current slate (from the feed) and the player's tickets,
 *  - place bets — but only on games that are still `upcoming` (betting closes
 *    when a game goes live, CLAUDE.md §4),
 *  - AUTO-SETTLE: whenever the feed reports an event final, any open ticket whose
 *    every leg is now final is graded against the official scores and the figure
 *    adjusts — exactly the behaviour the real API will drive.
 *
 * It's framework-agnostic (plain subscribe/notify) so React just mirrors it.
 */

import type { Account } from '../core/index.js'
import {
  cashOutTicket,
  cashOutValue,
  gradeTicket,
  placeTicket,
  type PlaceTicketOptions,
  type Ticket,
} from './engine.js'
import { gradeSelection, type GameEvent, type MatchResult } from './markets.js'
import type { FeedHealth, SportsbookFeed } from './provider.js'
import { applyOverlay, subscribeOverlay } from './book/overlay.js'

export interface SportsbookState {
  events: GameEvent[]
  tickets: Ticket[]
  /** Feed connection health (status + freshness), for the live indicator. */
  health: FeedHealth
}

export interface SportsbookStore {
  getState(): SportsbookState
  subscribe(listener: () => void): () => void
  /** Place one or more tickets (singles and/or a parlay). Throws if a leg's game
   *  is no longer open or the stake doesn't fit; nothing is placed on a throw of
   *  the first ticket. */
  place(reqs: PlaceTicketOptions[]): Ticket[]
  /** The current cash-out value (cents) of an open ticket, 0 if not cashable. */
  cashOutValueOf(ticketId: string): number
  /** Cash out an open ticket at its current value. */
  cashOut(ticketId: string): void
  destroy(): void
}

export interface CreateStoreOptions {
  feed: SportsbookFeed
  /** Called whenever the shared balance moves (a bet placed or auto-settled). */
  onBalanceChange?: () => void
}

/** Final scores keyed by event id, for grading. */
function resultsFromFinals(events: GameEvent[]): Record<string, MatchResult> {
  const out: Record<string, MatchResult> = {}
  for (const e of events) if (e.status === 'final' && e.score) out[e.id] = e.score
  return out
}

export function createStore(account: Account, opts: CreateStoreOptions): SportsbookStore {
  const { feed, onBalanceChange } = opts
  // The feed is the RAW slate; the player sees it with the book's line management
  // (suspensions, line moves, vig) applied on top. We keep both so an overlay
  // change can re-derive the player slate without waiting for the next feed push.
  let rawEvents = feed.snapshot()
  let events = applyOverlay(rawEvents)
  let tickets: Ticket[] = []
  // A feed may not implement the health channel; treat such feeds as always-live.
  let health: FeedHealth = feed.getHealth?.() ?? { status: 'live', lastUpdated: null }
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())

  /**
   * Settle every open ticket that is now decided: all legs final, OR a parlay
   * with a leg that has already lost (it's dead — no point waiting for the rest).
   * Returns true if any settled.
   */
  function settleReady(slate: GameEvent[]): boolean {
    const byId = new Map(slate.map((e) => [e.id, e]))
    const results = resultsFromFinals(slate)
    let changed = false
    for (const t of tickets) {
      if (t.status !== 'open') continue
      const allFinal = t.legs.every((l) => byId.get(l.eventId)?.status === 'final')
      const anyLost = t.legs.some((l) => {
        const e = byId.get(l.eventId)
        return e?.status === 'final' && gradeSelection(l, e.score) === 'loss'
      })
      if (!allFinal && !anyLost) continue
      gradeTicket(account, t, results) // a single loss → 'lost' regardless of undecided legs
      changed = true
    }
    return changed
  }

  const unsubscribe = feed.subscribe((slate) => {
    rawEvents = slate
    events = applyOverlay(slate)
    // Grading reads each event's status/score, which the overlay never changes
    // (it only touches upcoming markets), so settling on the applied slate is
    // identical to settling on the raw one.
    const settled = settleReady(events)
    if (settled) onBalanceChange?.()
    notify()
  })
  const unsubscribeHealth = feed.subscribeHealth?.((h) => {
    health = h
    notify()
  })
  // A manager moved a line / set vig / suspended a market — re-derive the player
  // slate from the same raw feed and re-render. No settlement: the overlay only
  // affects what is still bettable, never a result.
  const unsubscribeOverlay = subscribeOverlay(() => {
    events = applyOverlay(rawEvents)
    notify()
  })
  feed.start()

  return {
    getState: () => ({ events, tickets, health }),

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    place(reqs) {
      // Pre-game legs need an upcoming game; in-play (live) legs need a live one.
      const statusById = new Map(events.map((e) => [e.id, e.status]))
      // Markets the book has suspended (by selection id) — priced but unbettable.
      const suspended = new Set<string>()
      for (const e of events) for (const s of e.selections) if (s.suspended) suspended.add(s.id)
      for (const r of reqs) {
        for (const leg of r.legs) {
          if (suspended.has(leg.id)) throw new Error(`betting is suspended on ${leg.label}`)
          const status = statusById.get(leg.eventId)
          const open = leg.live ? status === 'live' : status === 'upcoming'
          if (!open) throw new Error(`betting is closed on ${leg.label}`)
        }
      }
      const placed = reqs.map((r) => placeTicket(account, r))
      tickets = [...placed, ...tickets]
      onBalanceChange?.()
      notify()
      return placed
    },

    cashOutValueOf(ticketId) {
      const t = tickets.find((x) => x.id === ticketId)
      return t ? cashOutValue(t, events) : 0
    },

    cashOut(ticketId) {
      const t = tickets.find((x) => x.id === ticketId)
      if (!t || t.status !== 'open') return
      cashOutTicket(account, t, events)
      onBalanceChange?.()
      notify()
    },

    destroy() {
      unsubscribe()
      unsubscribeHealth?.()
      unsubscribeOverlay()
      feed.stop()
      listeners.clear()
    },
  }
}
