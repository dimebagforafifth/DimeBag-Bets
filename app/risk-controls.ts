/**
 * Risk controls (CLAUDE.md §4) — the LIMITS + ALERTS + AUTO-SUSPEND layer on top of the
 * consolidated exposure engine (app/exposure.ts). Configurable thresholds per
 * book/player/market/sport/bet-type, in-app alerts (with a hook for SMS/email later), and
 * auto-actions on breach.
 *
 * MONEY/LIMIT SAFETY: this NEVER moves money or edits the per-member editor. Auto-actions
 * route through the EXISTING org per-member path — `setMaxWager` / `setBettingLocked` (the
 * same functions the editor calls) — and a market suspension is a risk-owned flag the book
 * is meant to consult (// SEAM below). Everything else is read-only over the bets store.
 *
 * In-memory external stores (subscribe / version), mock-default, no keys — identical to the
 * other app stores; survives nothing by design (live risk state).
 */

import {
  getMember,
  membersByRole,
  setBettingLocked,
  setMaxWager,
  type Member,
  type Org,
} from '../org/index.js'
import { combinedDecimal, legFromSelection, type SlipLeg } from './book/slip.js'
import { mockSlate } from './book/mockBook.js'
import type { NormalizedEvent } from '../lib/odds/contract.js'
import type { BookBet } from './book/bets-store.js'
import type { ConsolidatedExposure, CorrelatedDownside } from './exposure.js'

export type ThresholdScope = 'book' | 'player' | 'market' | 'sport' | 'bet-type'
/** What's measured: open liability under the scope, the correlated chalk-day liability,
 *  or a player's live figure (how far the book is down to them). */
export type ThresholdMetric = 'liability' | 'correlated' | 'player-figure'
/** What happens on breach. 'alert' only notifies; the rest route through core/org or the
 *  market-suspension flag. */
export type AutoAction = 'alert' | 'reduce-limit' | 'suspend-player' | 'suspend-market'

export interface Threshold {
  id: string
  label: string
  scope: ThresholdScope
  /** A specific key in the scope (a marketType / sport / playerId); omit = every key. */
  scopeKey?: string
  metric: ThresholdMetric
  /** Breach when the measured value exceeds this, in cents. */
  limitCents: number
  action: AutoAction
  enabled: boolean
}

export interface Breach {
  thresholdId: string
  label: string
  scope: ThresholdScope
  scopeKey: string
  metric: ThresholdMetric
  valueCents: number
  limitCents: number
  overByCents: number
  severity: 'warn' | 'critical'
  action: AutoAction
}

export interface Alert {
  id: string
  /** The threshold that raised it (with scopeKey, the dedup key). */
  thresholdId: string
  at: number
  severity: 'warn' | 'critical'
  scope: ThresholdScope
  scopeKey: string
  metric: ThresholdMetric
  message: string
  valueCents: number
  limitCents: number
  action: AutoAction
  /** True once an auto-action has been applied for this breach. */
  acted: boolean
  acknowledged: boolean
}

export interface AppliedAction {
  action: AutoAction
  target: string
  label: string
}

/* ----------------------------- shared store plumbing ---------------------- */
const listeners = new Set<() => void>()
let version = 0
function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}
export function subscribeRiskControls(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function riskControlsVersion(): number {
  return version
}

/* -------------------------------- thresholds ------------------------------ */
const DEFAULT_THRESHOLDS: Threshold[] = [
  { id: 'book-liability', label: 'Book open liability', scope: 'book', metric: 'liability', limitCents: 150_000, action: 'alert', enabled: true },
  { id: 'book-chalk', label: 'Chalk-day downside', scope: 'book', metric: 'correlated', limitCents: 100_000, action: 'alert', enabled: true },
  { id: 'market-ml', label: 'Moneyline liability', scope: 'market', scopeKey: 'moneyline', metric: 'liability', limitCents: 90_000, action: 'suspend-market', enabled: true },
  { id: 'player-liability', label: 'Per-player liability', scope: 'player', metric: 'liability', limitCents: 100_000, action: 'alert', enabled: true },
]
let thresholds: Threshold[] = DEFAULT_THRESHOLDS.map((t) => ({ ...t }))

export function getThresholds(): Threshold[] {
  return thresholds
}
export function setThreshold(id: string, patch: Partial<Threshold>): void {
  thresholds = thresholds.map((t) => (t.id === id ? { ...t, ...patch, id: t.id } : t))
  notify()
}
export function addThreshold(t: Omit<Threshold, 'id'> & { id?: string }): Threshold {
  const created: Threshold = { ...t, id: t.id ?? `th-${thresholds.length + 1}-${t.scope}` }
  thresholds = [...thresholds, created]
  notify()
  return created
}
export function removeThreshold(id: string): void {
  thresholds = thresholds.filter((t) => t.id !== id)
  notify()
}

/* ------------------------------ breach evaluation ------------------------- */
function rowsToValues(
  rows: { key: string; label: string; liabilityCents: number }[],
  scopeKey: string | undefined,
): Array<{ scopeKey: string; label: string; value: number }> {
  const sel = scopeKey ? rows.filter((r) => r.key === scopeKey) : rows
  return sel.map((r) => ({ scopeKey: r.key, label: r.label, value: r.liabilityCents }))
}

function candidatesFor(
  t: Threshold,
  exposure: ConsolidatedExposure,
  correlated: CorrelatedDownside,
  org: Org | undefined,
): Array<{ scopeKey: string; label: string; value: number }> {
  switch (t.scope) {
    case 'book':
      return [
        {
          scopeKey: 'book',
          label: 'Book',
          value: t.metric === 'correlated' ? correlated.chalkLiabilityCents : exposure.totalLiabilityCents,
        },
      ]
    case 'player':
      if (t.metric === 'player-figure') {
        const players = org ? membersByRole(org, 'player') : []
        const sel = t.scopeKey ? players.filter((p) => p.id === t.scopeKey) : players
        // figure UP = book is down to the player → that's the exposure we cap
        return sel.map((p) => ({ scopeKey: p.id, label: p.name, value: p.account.balance }))
      }
      return rowsToValues(exposure.byPlayer, t.scopeKey)
    case 'market':
      return rowsToValues(exposure.byMarket, t.scopeKey)
    case 'sport':
      return rowsToValues(exposure.bySport, t.scopeKey)
    case 'bet-type':
      return rowsToValues(exposure.byBetType, t.scopeKey)
  }
}

/** Evaluate every enabled threshold against current exposure → the breaches. Pure. */
export function evaluateBreaches(
  exposure: ConsolidatedExposure,
  correlated: CorrelatedDownside,
  list: Threshold[] = thresholds,
  org?: Org,
): Breach[] {
  const breaches: Breach[] = []
  for (const t of list) {
    if (!t.enabled) continue
    for (const c of candidatesFor(t, exposure, correlated, org)) {
      if (c.value <= t.limitCents) continue
      const overBy = c.value - t.limitCents
      breaches.push({
        thresholdId: t.id,
        label: `${t.label}: ${c.label}`,
        scope: t.scope,
        scopeKey: c.scopeKey,
        metric: t.metric,
        valueCents: c.value,
        limitCents: t.limitCents,
        overByCents: overBy,
        severity: c.value >= t.limitCents * 1.5 ? 'critical' : 'warn',
        action: t.action,
      })
    }
  }
  return breaches
}

/* --------------------------------- alerts --------------------------------- */
const MAX_ALERTS = 100
let alerts: Alert[] = []
let alertSeq = 0
/** The SMS/email hook seam — listeners fire on every raised alert. // SEAM: wire an SMS /
 *  email transport here; today it's in-app only. */
const alertHooks = new Set<(a: Alert) => void>()

export function onAlert(hook: (a: Alert) => void): () => void {
  alertHooks.add(hook)
  return () => {
    alertHooks.delete(hook)
  }
}

function alertKey(thresholdId: string, scopeKey: string): string {
  return `${thresholdId}|${scopeKey}`
}

/** Raise (or refresh) an alert from a breach, de-duped by threshold+scope. */
export function raiseAlert(
  breach: Breach,
  now: number,
  opts: { acted?: boolean; message?: string } = {},
): Alert {
  const key = alertKey(breach.thresholdId, breach.scopeKey)
  const existing = alerts.find((a) => alertKey(a.thresholdId, a.scopeKey) === key)
  const alert: Alert = {
    id: existing?.id ?? `al-${(alertSeq += 1)}`,
    thresholdId: breach.thresholdId,
    at: now,
    severity: breach.severity,
    scope: breach.scope,
    scopeKey: breach.scopeKey,
    metric: breach.metric,
    message: opts.message ?? defaultMessage(breach),
    valueCents: breach.valueCents,
    limitCents: breach.limitCents,
    action: breach.action,
    acted: opts.acted ?? existing?.acted ?? false,
    acknowledged: false,
  }
  alerts = [alert, ...alerts.filter((a) => a.id !== alert.id)].slice(0, MAX_ALERTS)
  notify()
  for (const h of alertHooks) h(alert)
  return alert
}

function defaultMessage(b: Breach): string {
  const dollars = (c: number) => `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  return `${b.label} at ${dollars(b.valueCents)} — over the ${dollars(b.limitCents)} limit`
}

/** Raise an alert for every breach (the in-app notification step). Returns the alerts. */
export function raiseAlertsForBreaches(breaches: Breach[], now: number): Alert[] {
  return breaches.map((b) => raiseAlert(b, now))
}

export function getAlerts(): Alert[] {
  return alerts
}
export function acknowledgeAlert(id: string): void {
  alerts = alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
  notify()
}

/* --------------------------- market suspension ---------------------------- */
// A risk-owned set of suspended market keys. // SEAM: the book's placement path
// (app/book/placement.placeBookBet) should refuse a leg whose marketType/sport is in
// here — a one-line guard the wiring pass can add; risk owns the toggle + the state.
let suspendedMarkets = new Set<string>()
export function suspendMarket(key: string): void {
  if (!suspendedMarkets.has(key)) {
    suspendedMarkets = new Set(suspendedMarkets).add(key)
    notify()
  }
}
export function unsuspendMarket(key: string): void {
  if (suspendedMarkets.has(key)) {
    const next = new Set(suspendedMarkets)
    next.delete(key)
    suspendedMarkets = next
    notify()
  }
}
export function isMarketSuspended(key: string): boolean {
  return suspendedMarkets.has(key)
}
export function getSuspendedMarkets(): string[] {
  return [...suspendedMarkets]
}

/* ------------------------------ auto-actions ------------------------------ */
/** A reduced max-bet on breach: halve a player's current cap, or set one at a quarter of
 *  their credit line if none. Floor of $5 so it never hits zero. */
function reducedMaxWager(m: Member): number {
  const current = m.account.maxWager ?? Math.floor(m.account.creditLimit / 4)
  return Math.max(500, Math.floor(current / 2))
}

/**
 * Apply the auto-action for each breach that has one (≠ 'alert'). Player actions route
 * through the EXISTING org per-member path (setMaxWager / setBettingLocked) — never the
 * editor, never a new money path; market suspension flips the risk-owned flag. Each
 * applied action raises an `acted` alert. Returns what was applied.
 */
export function runAutoActions(breaches: Breach[], org: Org, now: number): AppliedAction[] {
  const applied: AppliedAction[] = []
  for (const b of breaches) {
    if (b.action === 'alert') continue
    try {
      if (b.action === 'suspend-market') {
        suspendMarket(b.scopeKey)
        applied.push({ action: b.action, target: b.scopeKey, label: b.label })
      } else if (b.scope === 'player' && b.action === 'suspend-player') {
        setBettingLocked(org, b.scopeKey, true)
        applied.push({ action: b.action, target: b.scopeKey, label: b.label })
      } else if (b.scope === 'player' && b.action === 'reduce-limit') {
        const m = getMember(org, b.scopeKey)
        setMaxWager(org, b.scopeKey, reducedMaxWager(m))
        applied.push({ action: b.action, target: b.scopeKey, label: b.label })
      } else {
        continue // an action that doesn't apply to this scope (e.g. suspend-player on a market)
      }
      raiseAlert(b, now, { acted: true, message: `Auto-action: ${describeAction(b.action)} — ${b.label}` })
    } catch {
      /* a bad target (unknown id / non-player) is skipped, never throws out of the sweep */
    }
  }
  return applied
}

function describeAction(a: AutoAction): string {
  return {
    alert: 'alert',
    'reduce-limit': 'reduced max bet',
    'suspend-player': 'suspended player',
    'suspend-market': 'suspended market',
  }[a]
}

/* --------------------------------- seed ----------------------------------- */
function findLeg(
  slate: NormalizedEvent[],
  eventId: string,
  spec: { type: SlipLeg['marketType']; side: string; line?: number; playerId?: string },
): SlipLeg | null {
  const event = slate.find((e) => e.eventId === eventId)
  if (!event) return null
  const market = event.markets.find(
    (m) =>
      m.type === spec.type &&
      !m.marketId.includes('-alt') &&
      (spec.playerId ? m.playerId === spec.playerId : !m.playerId),
  )
  if (!market) return null
  const sel = market.selections.find(
    (s) => s.side === spec.side && (spec.line === undefined || s.line === spec.line),
  )
  return sel ? legFromSelection(event, market, sel) : null
}

let seeded = false
/** Display-only demo bets for the risk surface. These NEVER touch core or the shared bets
 *  store / org (so other panels' "No betting activity" and the settle path are unaffected) —
 *  the panel merges them with the real open bets purely to compute exposure. Like the
 *  round-2 social seed, demo data lives in its own module, not a shared store. */
let demoBets: BookBet[] = []

/** The display-only seeded open bets (merged with real open bets by the panel). */
export function getDemoBets(): BookBet[] {
  return demoBets
}

/**
 * Seed realistic live risk for the demo surface: a cross-game favourites parlay, a same-game
 * parlay, chalk singles and one underdog (built from the real mock slate), plus a prior
 * auto-suspend example. Idempotent. DISPLAY-ONLY — no money/org/bets-store mutation; the
 * thresholds ship with defaults, so opening the panel shows live exposure, a breach or two,
 * and the correlated chalk-day downside.
 */
export function seedRiskDemo(now: number): void {
  if (seeded) return
  seeded = true
  const slate = mockSlate()
  let seq = 0
  const make = (
    player: string,
    name: string,
    rawLegs: Array<SlipLeg | null>,
    mode: 'single' | 'parlay',
    stakeCents: number,
  ): BookBet | null => {
    const legs = rawLegs.filter((l): l is SlipLeg => l !== null)
    if (legs.length === 0) return null
    const decimal = mode === 'parlay' && legs.length >= 2 ? combinedDecimal(legs).decimal : legs[0].price.decimal
    return { id: `demo-${(seq += 1)}`, accountId: player, playerName: name, placedBy: name, mode, legs, stakeCents, decimal, status: 'open', placedAt: now }
  }

  demoBets = [
    // Dana — a cross-game favourites parlay (the correlated chalk-day blow-up).
    make('p-dana', 'Dana', [
      findLeg(slate, 'nba-lal-bos', { type: 'moneyline', side: 'home' }), // Lakers (fav)
      findLeg(slate, 'nfl-kc-buf', { type: 'moneyline', side: 'home' }), // Chiefs (fav)
      findLeg(slate, 'mlb-lad-nyy', { type: 'moneyline', side: 'home' }), // Dodgers (fav)
    ], 'parlay', 20_000),
    // Lena — a same-game parlay (an SGP correlation cluster).
    make('p-lena', 'Lena', [
      findLeg(slate, 'nfl-kc-buf', { type: 'moneyline', side: 'home' }),
      findLeg(slate, 'nfl-kc-buf', { type: 'prop', side: 'over', playerId: 'P. Mahomes' }),
    ], 'parlay', 8_000),
    make('p-dana', 'Dana', [findLeg(slate, 'nba-lal-bos', { type: 'total', side: 'over', line: 224.5 })], 'single', 15_000),
    make('p-priya', 'Priya', [findLeg(slate, 'nhl-col-veg', { type: 'moneyline', side: 'home' })], 'single', 5_000),
    make('p-marco', 'Marco', [findLeg(slate, 'nba-lal-bos', { type: 'moneyline', side: 'away' })], 'single', 4_000), // Celtics (dog)
  ].filter((b): b is BookBet => b !== null)

  // A prior auto-suspend example so the surface shows the capability + its history.
  suspendMarket('prop')
  raiseAlert(
    {
      thresholdId: 'market-prop',
      label: 'Player-prop liability: Player props',
      scope: 'market',
      scopeKey: 'prop',
      metric: 'liability',
      valueCents: 120_000,
      limitCents: 90_000,
      overByCents: 30_000,
      severity: 'critical',
      action: 'suspend-market',
    },
    now - 60_000,
    { acted: true, message: 'Auto-action: suspended market — Player props over the $900 limit' },
  )
}

/* --------------------------------- resets --------------------------------- */
export function __resetRiskControls(): void {
  thresholds = DEFAULT_THRESHOLDS.map((t) => ({ ...t }))
  alerts = []
  alertSeq = 0
  suspendedMarkets = new Set()
  demoBets = []
  seeded = false
  notify()
}

/** Reset only the seed flag (tests that drive seeding explicitly). */
export function __resetRiskSeed(): void {
  seeded = false
}
