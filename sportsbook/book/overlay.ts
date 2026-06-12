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

import {
  effectiveMargin,
  houseMarginActive,
  publishMarket,
  recordPricingAudit,
  type LineOverride,
  type MarginMethod,
} from '../trading/index.js'
import { formatAmerican } from '../odds.js'
import { createStore, persistedDoc, type Doc } from '../../persistence/index.js'
import type { GameEvent, MarketKind, Selection } from '../markets.js'

/** A manager's adjustment to one market (an event's moneyline / spread / total). */
export interface MarketAdjustment {
  /** No betting on this market while true. */
  suspended?: boolean
  /** Points shifted onto the home spread / the total line (± in ½-pt steps). */
  lineShift?: number
  /** Target market margin (overround − 1), e.g. 0.05 = a 5% market. Undefined keeps
   *  the feed's own price (or the house margin, if one is set). */
  margin?: number
  /** How the target margin is distributed across the two sides. */
  marginMethod?: MarginMethod
  /** Directional shading in basis points: + toward home/over, − toward away/under. */
  shadeBps?: number
  /** A MANUAL OVERRIDE of the published number — wins over margin/shift/shade and is not
   *  clobbered by feed updates (the desk shows the drift instead). */
  override?: LineOverride
}

const MARKETS: MarketKind[] = ['moneyline', 'spread', 'total']
const LINE_SHIFT_CAP = 50 // ±50 points is far past any sane move; just a guard
const MARGIN_CAP = 0.25 // 25% is already an extreme book

/* ------------------------------- the state ------------------------------- */
// The overlay is a shared singleton — one slate, every player sees the same lines — and
// it now PERSISTS (Part 2: "overrides persist until cleared or the market closes") through
// the standard doc seam, so suspensions, line moves and overrides survive a reload.

interface OverlayState {
  suspendedEvents: string[]
  suspendedLeagues: string[]
  marketAdj: Record<string, MarketAdjustment>
}

const pstore = createStore({ namespace: 'dimebag' })
const DOC: Doc<OverlayState> = persistedDoc<OverlayState>(pstore, 'lines.overlay', {
  version: 1,
  initial: { suspendedEvents: [], suspendedLeagues: [], marketAdj: {} },
})

const loaded = DOC.load()
const suspendedEvents = new Set<string>(loaded?.suspendedEvents ?? [])
const suspendedLeagues = new Set<string>(loaded?.suspendedLeagues ?? [])
const marketAdj = new Map<string, MarketAdjustment>(Object.entries(loaded?.marketAdj ?? {}))
let version = 0
const listeners = new Set<() => void>()

const mkey = (eventId: string, market: MarketKind) => `${eventId}|${market}`

function persist(): void {
  DOC.save({
    suspendedEvents: [...suspendedEvents],
    suspendedLeagues: [...suspendedLeagues],
    marketAdj: Object.fromEntries(marketAdj),
  })
}

function bump(): void {
  persist()
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

/** Whether a whole league is suspended (stops every market in it). */
export function isLeagueSuspended(league: string): boolean {
  return suspendedLeagues.has(league)
}

/** Whether a specific market is suspended (event-level OR market-level). League-level
 *  suspension also closes the market but is keyed by league — see `isLeagueSuspended`
 *  and `applyToEvent`, which set the per-selection flag the store reads. */
export function isMarketSuspended(eventId: string, market: MarketKind): boolean {
  return suspendedEvents.has(eventId) || marketAdj.get(mkey(eventId, market))?.suspended === true
}

/** Does this market carry a manual override of the published number? */
export function hasOverride(eventId: string, market: MarketKind): boolean {
  const ov = marketAdj.get(mkey(eventId, market))?.override
  return !!ov && (!!ov.odds || ov.line != null)
}

/** Does this market carry any non-default adjustment? (for a "managed" badge) */
export function isMarketAdjusted(eventId: string, market: MarketKind): boolean {
  if (suspendedEvents.has(eventId)) return true
  const a = marketAdj.get(mkey(eventId, market))
  return (
    !!a &&
    (a.suspended === true ||
      !!a.lineShift ||
      a.margin != null ||
      !!a.shadeBps ||
      (!!a.override && (!!a.override.odds || a.override.line != null)))
  )
}

/* ------------------------------- mutating ------------------------------- */

function patch(eventId: string, market: MarketKind, change: Partial<MarketAdjustment>): void {
  const key = mkey(eventId, market)
  const next: MarketAdjustment = { ...marketAdj.get(key), ...change }
  const empty =
    !next.suspended &&
    !next.lineShift &&
    next.margin == null &&
    !next.shadeBps &&
    !(next.override && (next.override.odds || next.override.line != null))
  if (empty) marketAdj.delete(key)
  else marketAdj.set(key, next)
  bump()
}

/** Audit one pricing change (who/when/what, before→after). `actor` defaults to the
 *  pricing actor set on the precedence module. */
function audit(action: string, scope: string, detail: string): void {
  recordPricingAudit({ action, scope, detail })
}

/** Suspend / un-suspend one market. */
export function setMarketSuspended(eventId: string, market: MarketKind, on: boolean): void {
  if (isMarketSuspended(eventId, market) === on) return
  patch(eventId, market, { suspended: on })
  audit('suspend', `${eventId}|${market}`, on ? 'Market pulled' : 'Market reopened')
}

/** Suspend / un-suspend a whole event (all its markets). */
export function setEventSuspended(eventId: string, on: boolean): void {
  if (suspendedEvents.has(eventId) === on) return
  if (on) suspendedEvents.add(eventId)
  else suspendedEvents.delete(eventId)
  bump()
  audit('suspend', eventId, on ? 'Game suspended' : 'Game reopened')
}

/** Suspend / un-suspend a whole LEAGUE (every event in it). */
export function setLeagueSuspended(league: string, on: boolean): void {
  if (suspendedLeagues.has(league) === on) return
  if (on) suspendedLeagues.add(league)
  else suspendedLeagues.delete(league)
  bump()
  audit('suspend', league, on ? `League ${league} suspended` : `League ${league} reopened`)
}

/** Move a market's line by `delta` points (spread/total only; ignored for ML). */
export function nudgeLine(eventId: string, market: MarketKind, delta: number): void {
  if (market === 'moneyline') return
  const cur = marketAdj.get(mkey(eventId, market))?.lineShift ?? 0
  const next = Math.max(-LINE_SHIFT_CAP, Math.min(LINE_SHIFT_CAP, cur + delta))
  patch(eventId, market, { lineShift: next === 0 ? undefined : next })
  audit('line', `${eventId}|${market}`, `Line shift ${sgn(cur)} → ${sgn(next)} pts`)
}

/** Set a market's target margin (the vig), or null to revert to the feed/house price. */
export function setMargin(
  eventId: string,
  market: MarketKind,
  margin: number | null,
  method: MarginMethod = 'proportional',
): void {
  const before = marketAdj.get(mkey(eventId, market))?.margin
  if (margin == null) {
    patch(eventId, market, { margin: undefined, marginMethod: undefined })
    audit('margin', `${eventId}|${market}`, `Margin ${pctOf(before)} → feed`)
    return
  }
  const clamped = Math.max(0, Math.min(MARGIN_CAP, margin))
  patch(eventId, market, { margin: clamped, marginMethod: method })
  audit('margin', `${eventId}|${market}`, `Margin ${pctOf(before)} → ${pctOf(clamped)}`)
}

/** Bias one side of a market by `bps` basis points (+ home/over, − away/under), or 0
 *  to clear. A lighter touch than a full line move when exposure is lopsided. */
export function setShade(eventId: string, market: MarketKind, bps: number): void {
  const before = marketAdj.get(mkey(eventId, market))?.shadeBps ?? 0
  patch(eventId, market, { shadeBps: bps === 0 ? undefined : bps })
  audit('shade', `${eventId}|${market}`, `Shade ${before} → ${bps} bps`)
}

/** Pin the published number for a market — the highest-priority layer. Persists until
 *  cleared or the market closes; feed updates never clobber it (the desk shows drift). */
export function setLineOverride(eventId: string, market: MarketKind, override: LineOverride): void {
  patch(eventId, market, { override })
  const parts: string[] = []
  if (override.odds) parts.push(`odds ${formatAmerican(override.odds[0])}/${formatAmerican(override.odds[1])}`)
  if (override.line != null) parts.push(`line ${override.line}`)
  audit('override', `${eventId}|${market}`, `Manual override set (${parts.join(', ') || 'cleared'})`)
}

/** Clear a market's manual override (back to the computed pipeline price). */
export function clearLineOverride(eventId: string, market: MarketKind): void {
  patch(eventId, market, { override: undefined })
  audit('override', `${eventId}|${market}`, 'Manual override cleared')
}

/** Clear every adjustment on a market. */
export function resetMarket(eventId: string, market: MarketKind): void {
  marketAdj.delete(mkey(eventId, market))
  bump()
  audit('reset', `${eventId}|${market}`, 'Market reset to feed')
}

/** Clear all line management (suspensions + adjustments). Mainly for tests/reset. */
export function resetOverlay(): void {
  suspendedEvents.clear()
  suspendedLeagues.clear()
  marketAdj.clear()
  bump()
}

const pctOf = (m: number | undefined) => (m == null ? 'feed' : `${(m * 100).toFixed(1)}%`)

/* ----------------------------- applying it ------------------------------ */

const sgn = (n: number) => (n > 0 ? `+${n}` : `${n}`)

/**
 * Apply the full pricing pipeline for one event, market by market, through
 * `publishMarket` (feed → house/market margin → adjustments → manual override), then the
 * suspension flag (league / event / market). Only `upcoming` events are touched;
 * live/final pass straight through (the feed/core own them, and an open ticket keeps the
 * price it locked, §4).
 */
function applyToEvent(e: GameEvent): GameEvent {
  if (e.status !== 'upcoming') return e
  const leagueSusp = suspendedLeagues.has(e.league)
  const evtSusp = suspendedEvents.has(e.id)
  const anyAdj = MARKETS.some((m) => marketAdj.has(mkey(e.id, m)))
  const houseTouches = MARKETS.some((m) => effectiveMargin(e.league, m).margin != null)
  if (!leagueSusp && !evtSusp && !anyAdj && !houseTouches) return e // nothing to do

  const out: Selection[] = []
  for (const market of MARKETS) {
    const feedSels = e.selections.filter((s) => s.market === market)
    if (feedSels.length === 0) continue
    const adj = marketAdj.get(mkey(e.id, market))
    // Precedence: per-market margin beats league×market matrix beats global house.
    const eff = effectiveMargin(e.league, market, adj?.margin)
    const published = publishMarket({
      feed: feedSels,
      market,
      homeTeam: e.home,
      awayTeam: e.away,
      margin: eff.margin,
      marginMethod: adj?.marginMethod,
      lineShift: adj?.lineShift,
      shadeBps: adj?.shadeBps,
      override: adj?.override,
    })
    let sels = published.sels
    if (leagueSusp || evtSusp || adj?.suspended) {
      sels = sels.map((s) => ({ ...s, suspended: true }))
    }
    out.push(...sels)
  }
  return { ...e, selections: out }
}

/**
 * The player-facing slate: the feed's events with the book's line management applied.
 * Returns the same array reference when nothing is configured (no suspensions, no
 * adjustments, no house margin), so the store stays cheap when the book runs clean.
 */
export function applyOverlay(events: GameEvent[]): GameEvent[] {
  if (
    suspendedEvents.size === 0 &&
    suspendedLeagues.size === 0 &&
    marketAdj.size === 0 &&
    !houseMarginActive()
  ) {
    return events
  }
  return events.map(applyToEvent)
}
