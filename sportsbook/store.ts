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
  regradeTicket,
  placeTicket,
  type PlaceTicketOptions,
  type Ticket,
} from './engine.js'
import { gradeSelection, type GameEvent, type MatchResult } from './markets.js'
import type { FeedHealth, SportsbookFeed } from './provider.js'
import { applyOverlay, subscribeOverlay } from './book/overlay.js'
import { applyResults, isResultOverridden, subscribeResults } from './book/results.js'
import {
  getFutures,
  getFutureMarket,
  gradeFutureTicket,
  placeFutureTicket,
  subscribeFutures,
  type FutureTicket,
} from './book/futures.js'
import type { FutureMarket } from './bets/futures.js'

export interface SportsbookState {
  events: GameEvent[]
  tickets: Ticket[]
  /** The futures slate (outright markets), with any settlements applied. */
  futures: FutureMarket[]
  /** The player's futures bets. */
  futureTickets: FutureTicket[]
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
  /** Back a futures outcome — a single wager held through core, graded when the
   *  market settles. Throws if the market is settled or the stake doesn't fit. */
  placeFuture(marketId: string, outcomeId: string, stake: number): FutureTicket
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
  // The player-facing slate = the raw feed with the book's line management AND any
  // manual results the operator has entered (book/overlay + book/results) applied.
  // Both are shared singletons every player store reads, so one operator action moves
  // every book at once.
  const deriveSlate = (slate: GameEvent[]) => applyResults(applyOverlay(slate))
  let rawEvents = feed.snapshot()
  let events = deriveSlate(rawEvents)
  let tickets: Ticket[] = []
  let futures = getFutures()
  let futureTickets: FutureTicket[] = []
  // A feed may not implement the health channel; treat such feeds as always-live.
  let health: FeedHealth = feed.getHealth?.() ?? { status: 'live', lastUpdated: null }
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())

  /** Grade every open futures ticket whose market has now settled. Returns true if
   *  any settled (so the figure refresh fires). */
  function settleFutures(): boolean {
    let changed = false
    for (const t of futureTickets) {
      if (t.status !== 'open') continue
      const market = getFutureMarket(t.marketId)
      if (market?.status === 'settled') {
        gradeFutureTicket(account, t, market)
        changed = true
      }
    }
    return changed
  }

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

  /**
   * Re-grade ALREADY-SETTLED tickets after the operator entered or corrected a result
   * by hand (CLAUDE.md §4 palpable-error re-settle). Only tickets that touch an
   * operator-overridden event are reconsidered — feed-graded tickets are left to the
   * feed — and only once every leg is final. regradeTicket moves the figure by the
   * payout difference through core (a no-op when the corrected outcome is unchanged),
   * so this is safe to run on every results change. Returns true if any figure moved.
   */
  function resettleOverridden(slate: GameEvent[]): boolean {
    const byId = new Map(slate.map((e) => [e.id, e]))
    const results = resultsFromFinals(slate)
    let changed = false
    for (const t of tickets) {
      if (t.status === 'open' || t.status === 'cashed') continue
      if (!t.legs.some((l) => isResultOverridden(l.eventId))) continue
      if (!t.legs.every((l) => byId.get(l.eventId)?.status === 'final')) continue
      if (regradeTicket(account, t, results)) changed = true
    }
    return changed
  }

  const unsubscribe = feed.subscribe((slate) => {
    rawEvents = slate
    events = deriveSlate(slate)
    // Settle on the derived slate: the line overlay never changes a result (only
    // upcoming pricing), but the results overlay can final/void an event by hand, so
    // grading must read the operator's results, not just the feed's.
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
    events = deriveSlate(rawEvents)
    notify()
  })
  // The operator entered, corrected, or voided a result by hand (the scores desk) —
  // re-derive the slate, settle every open ticket now decided (exactly as a feed final
  // would), AND re-grade any already-settled ticket whose result the operator changed.
  const unsubscribeResults = subscribeResults(() => {
    events = deriveSlate(rawEvents)
    const settled = settleReady(events)
    const resettled = resettleOverridden(events)
    if (settled || resettled) onBalanceChange?.()
    notify()
  })
  // The operator (or a real feed later) declared a futures winner — grade this
  // player's open futures tickets through core and refresh the slate.
  const unsubscribeFutures = subscribeFutures(() => {
    const settled = settleFutures()
    futures = getFutures()
    if (settled) onBalanceChange?.()
    notify()
  })
  feed.start()

  return {
    getState: () => ({ events, tickets, futures, futureTickets, health }),

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

    placeFuture(marketId, outcomeId, stake) {
      const market = getFutureMarket(marketId)
      if (!market) throw new Error(`unknown futures market ${marketId}`)
      const ticket = placeFutureTicket(account, market, outcomeId, stake)
      futureTickets = [ticket, ...futureTickets]
      onBalanceChange?.()
      notify()
      return ticket
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
      unsubscribeResults()
      unsubscribeFutures()
      feed.stop()
      listeners.clear()
    },
  }
}
