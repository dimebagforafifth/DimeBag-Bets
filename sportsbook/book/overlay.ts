/**
 * The book overlay (CLAUDE.md §4, §6) — the operator's line management, applied
 * on top of whatever the data feed posts.
 *
 * The feed (mock now, a real API later) is the RAW source of prices and scores.
 * The book then runs its OWN adjustments over that slate before players bet it:
 *  - suspend a market (or a whole event) so it can't be bet,
 *  - move a line (shift a spread/total in ½-point steps),
 *  - set the vig/margin (reprice a two-way market to a target overround).
 *
 * This is a single shared book (one slate, every player sees the same lines), so
 * the overlay is a module-level singleton — exactly like the casino's shared
 * edge-store. The manager edits it from the trading desk; every player's
 * `SportsbookStore` applies it to its feed slate and re-renders. Crucially it only
 * touches `upcoming` markets (pre-game line management); live/final events pass
 * through untouched, so betting-close and grading stay exactly as the feed/core
 * decided. A bet already placed locked its own price (§4 acceptance), so a later
 * line move never re-prices an open ticket — only what's still bettable.
 */

import { decimalFromAmerican } from '../odds.js'
import { fairProbabilities, twoWayPrices, type MarginMethod } from '../trading/index.js'
import type { GameEvent, MarketKind, Selection } from '../markets.js'

/** A manager's adjustment to one market (an event's moneyline / spread / total). */
export interface MarketAdjustment {
  /** No betting on this market while true. */
  suspended?: boolean
  /** Points shifted onto the home spread / the total line (± in ½-pt steps). */
  lineShift?: number
  /** Target market margin (overround − 1), e.g. 0.05 = a 5% market. Undefined keeps
   *  the feed's own price. */
  margin?: number
  /** How the target margin is distributed across the two sides. */
  marginMethod?: MarginMethod
}

const MARKETS: MarketKind[] = ['moneyline', 'spread', 'total']
const LINE_SHIFT_CAP = 50 // ±50 points is far past any sane move; just a guard
const MARGIN_CAP = 0.25 // 25% is already an extreme book

/* ------------------------------- the state ------------------------------- */

const suspendedEvents = new Set<string>()
const marketAdj = new Map<string, MarketAdjustment>() // key: `${eventId}|${market}`
let version = 0
const listeners = new Set<() => void>()

const mkey = (eventId: string, market: MarketKind) => `${eventId}|${market}`

function bump(): void {
  version += 1
  for (const l of listeners) {
    try {
      l()
    } catch {
      /* a listener must never break line management */
    }
  }
}

/** Subscribe to overlay changes (for useSyncExternalStore / the store). */
export function subscribeOverlay(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A version counter that ticks on every change (for useSyncExternalStore). */
export function getOverlayVersion(): number {
  return version
}

/* ------------------------------- reading -------------------------------- */

/** The current adjustment for a market (a copy; undefined if untouched). */
export function getAdjustment(eventId: string, market: MarketKind): MarketAdjustment | undefined {
  const a = marketAdj.get(mkey(eventId, market))
  return a ? { ...a } : undefined
}

/** Whether a whole event is suspended. */
export function isEventSuspended(eventId: string): boolean {
  return suspendedEvents.has(eventId)
}

/** Whether a specific market is suspended (event-level OR market-level). */
export function isMarketSuspended(eventId: string, market: MarketKind): boolean {
  return suspendedEvents.has(eventId) || marketAdj.get(mkey(eventId, market))?.suspended === true
}

/** Does this market carry any non-default adjustment? (for a "managed" badge) */
export function isMarketAdjusted(eventId: string, market: MarketKind): boolean {
  if (suspendedEvents.has(eventId)) return true
  const a = marketAdj.get(mkey(eventId, market))
  return !!a && (a.suspended === true || !!a.lineShift || a.margin != null)
}

/* ------------------------------- mutating ------------------------------- */

function patch(eventId: string, market: MarketKind, change: Partial<MarketAdjustment>): void {
  const key = mkey(eventId, market)
  const next: MarketAdjustment = { ...marketAdj.get(key), ...change }
  // drop empty adjustments so isMarketAdjusted stays honest
  if (!next.suspended && !next.lineShift && next.margin == null) marketAdj.delete(key)
  else marketAdj.set(key, next)
  bump()
}

/** Suspend / un-suspend one market. */
export function setMarketSuspended(eventId: string, market: MarketKind, on: boolean): void {
  patch(eventId, market, { suspended: on })
}

/** Suspend / un-suspend a whole event (all its markets). */
export function setEventSuspended(eventId: string, on: boolean): void {
  if (on) suspendedEvents.add(eventId)
  else suspendedEvents.delete(eventId)
  bump()
}

/** Move a market's line by `delta` points (spread/total only; ignored for ML). */
export function nudgeLine(eventId: string, market: MarketKind, delta: number): void {
  if (market === 'moneyline') return
  const cur = marketAdj.get(mkey(eventId, market))?.lineShift ?? 0
  const next = Math.max(-LINE_SHIFT_CAP, Math.min(LINE_SHIFT_CAP, cur + delta))
  patch(eventId, market, { lineShift: next === 0 ? undefined : next })
}

/** Set a market's target margin (the vig), or null to revert to the feed price. */
export function setMargin(
  eventId: string,
  market: MarketKind,
  margin: number | null,
  method: MarginMethod = 'proportional',
): void {
  if (margin == null) {
    patch(eventId, market, { margin: undefined, marginMethod: undefined })
    return
  }
  const clamped = Math.max(0, Math.min(MARGIN_CAP, margin))
  patch(eventId, market, { margin: clamped, marginMethod: method })
}

/** Clear every adjustment on a market. */
export function resetMarket(eventId: string, market: MarketKind): void {
  marketAdj.delete(mkey(eventId, market))
  bump()
}

/** Clear all line management (suspensions + adjustments). Mainly for tests/reset. */
export function resetOverlay(): void {
  suspendedEvents.clear()
  marketAdj.clear()
  bump()
}

/* ----------------------------- applying it ------------------------------ */

const sgn = (n: number) => (n > 0 ? `+${n}` : `${n}`)

/** Apply a line shift to one spread/total selection (relabelled to match). */
function shiftLine(sel: Selection, e: GameEvent, market: MarketKind, delta: number): Selection {
  if (market === 'spread') {
    // The home line moves by +delta; the away line is its mirror, so −delta.
    const newLine = (sel.line ?? 0) + (sel.pick === 'home' ? delta : -delta)
    const team = sel.pick === 'home' ? e.home : e.away
    return { ...sel, line: newLine, label: `${team} ${sgn(newLine)}` }
  }
  // total: both sides share the line
  const newLine = (sel.line ?? 0) + delta
  const side = sel.pick === 'over' ? 'Over' : 'Under'
  return { ...sel, line: newLine, label: `${side} ${newLine}` }
}

/** Reprice a two-way market's odds to hit a target margin, de-vigging first so the
 *  fair probabilities are preserved and only the juice changes. */
function reprice(sels: Selection[], margin: number, method: MarginMethod): Selection[] {
  if (sels.length !== 2) return sels
  const fair = fairProbabilities(sels.map((s) => decimalFromAmerican(s.odds)), 'proportional')
  const [a, b] = twoWayPrices(fair[0], margin, method)
  return [
    { ...sels[0], odds: a.american },
    { ...sels[1], odds: b.american },
  ]
}

/** Apply every adjustment for one event, market by market. Only `upcoming` events
 *  are touched; live/final pass straight through. */
function applyToEvent(e: GameEvent): GameEvent {
  if (e.status !== 'upcoming') return e
  const evtSusp = suspendedEvents.has(e.id)
  if (!evtSusp && !MARKETS.some((m) => marketAdj.has(mkey(e.id, m)))) return e // nothing to do

  const out: Selection[] = []
  for (const market of MARKETS) {
    let sels = e.selections.filter((s) => s.market === market)
    if (sels.length === 0) continue
    const adj = marketAdj.get(mkey(e.id, market))

    if (adj?.lineShift && market !== 'moneyline') {
      sels = sels.map((s) => shiftLine(s, e, market, adj.lineShift!))
    }
    if (adj?.margin != null) {
      sels = reprice(sels, adj.margin, adj.marginMethod ?? 'proportional')
    }
    if (evtSusp || adj?.suspended) {
      sels = sels.map((s) => ({ ...s, suspended: true }))
    }
    out.push(...sels)
  }
  return { ...e, selections: out }
}

/**
 * The player-facing slate: the feed's events with the book's line management
 * applied. Returns the same array reference when nothing is adjusted, so the
 * store can stay cheap when the book is running clean.
 */
export function applyOverlay(events: GameEvent[]): GameEvent[] {
  if (suspendedEvents.size === 0 && marketAdj.size === 0) return events
  return events.map(applyToEvent)
}
