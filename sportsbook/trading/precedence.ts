/**
 * The deterministic PRICING PIPELINE (CLAUDE.md §4) — Part 2.
 *
 * One ordered set of layers turns a raw feed line into the number a player sees, and the
 * order is fixed and total:
 *
 *     feed line  →  house margin  →  league/market adjustments  →  manual override
 *     (lowest)                                                       (highest, wins)
 *
 * `publishMarket` is the pure resolver: given a market's feed selections plus whatever
 * layers are configured, it returns the published selections AND the highest layer that
 * touched them (so a "managed" badge and an audit detail can say *why* the number moved).
 * A manual override always wins and never gets clobbered by a feed update — instead we
 * surface the DRIFT between the override and the live feed-derived number, so a trader can
 * see how far their pinned price has wandered from the market.
 *
 * This module owns two persisted pieces — the house-margin config (a global hold plus a
 * per-league×market matrix) and the pricing AUDIT log (who/when/what, before→after) — on
 * the same persisted-doc blueprint as the rest of the book. The per-event suspensions,
 * line moves, shading and overrides live in `book/overlay` and call into here.
 */

import { createStore, persistedDoc, type Doc } from '../../persistence/index.js'
import { decimalFromAmerican } from './convert.js'
import { fairProbabilities } from './margin.js'
import { twoWayPrices, type MarginMethod } from './pricing.js'
import type { MarketKind, Selection } from '../markets.js'

/* ============================ the pure pipeline ============================ */

export type PublishSource = 'feed' | 'margin' | 'adjustment' | 'override'

/** A manager's pinned published values for a market — the highest-priority layer.
 *  `odds` pins the two sides' American prices; `line` pins the handicap/total. */
export interface LineOverride {
  odds?: [number, number]
  line?: number
}

export interface PublishLayers {
  /** The raw two-side market straight from the feed/cache. */
  feed: Selection[]
  market: MarketKind
  homeTeam: string
  awayTeam: string
  /** The EFFECTIVE margin for this market (already resolved: per-market beats matrix
   *  beats global), or null to keep the feed's own price. */
  margin?: number | null
  marginMethod?: MarginMethod
  /** Points shifted onto the home spread / the total line (± in ½-pt steps). */
  lineShift?: number
  /** Directional shading in basis points: + shades toward home/over (shortens it),
   *  − toward away/under. Biases an exposed side without a full line move. */
  shadeBps?: number
  /** A manual override of the published values — wins over everything. */
  override?: LineOverride
}

export interface PublishedMarket {
  sels: Selection[]
  /** The highest layer that changed the published number. */
  source: PublishSource
  /** When an override is active: the home-side American gap between the override and
   *  the live feed-derived price (override − feed). 0 when the two agree. */
  overrideDrift?: number
}

const sgn = (n: number) => (n > 0 ? `+${n}` : `${n}`)

/** Move one spread/total selection's handicap, relabelled to match. */
function shiftLine(sel: Selection, market: MarketKind, homeTeam: string, awayTeam: string, delta: number): Selection {
  if (market === 'spread') {
    const newLine = (sel.line ?? 0) + (sel.pick === 'home' ? delta : -delta)
    const team = sel.pick === 'home' ? homeTeam : awayTeam
    return { ...sel, line: newLine, label: `${team} ${sgn(newLine)}` }
  }
  const newLine = (sel.line ?? 0) + delta
  const side = sel.pick === 'over' ? 'Over' : 'Under'
  return { ...sel, line: newLine, label: `${side} ${newLine}` }
}

/** Reprice a two-way market to a target margin, de-vigging first so only the juice
 *  changes (fair probabilities preserved). */
function reprice(sels: Selection[], margin: number, method: MarginMethod): Selection[] {
  if (sels.length !== 2) return sels
  const fair = fairProbabilities(sels.map((s) => decimalFromAmerican(s.odds)), 'proportional')
  const [a, b] = twoWayPrices(fair[0], margin, method)
  return [
    { ...sels[0], odds: a.american },
    { ...sels[1], odds: b.american },
  ]
}

/** Directional shading: bias the home/over fair probability by `bps` basis points, then
 *  reprice at the same margin so the book leans off an exposed side. */
function shade(sels: Selection[], bps: number, margin: number, method: MarginMethod): Selection[] {
  if (sels.length !== 2 || bps === 0) return sels
  const fair = fairProbabilities(sels.map((s) => decimalFromAmerican(s.odds)), 'proportional')
  const shifted = Math.max(0.01, Math.min(0.99, fair[0] + bps / 10_000))
  const [a, b] = twoWayPrices(shifted, margin, method)
  return [
    { ...sels[0], odds: a.american },
    { ...sels[1], odds: b.american },
  ]
}

/**
 * Resolve one market's published selections through the fixed precedence. Pure — no
 * state — so it's exhaustively testable. The returned `source` is the highest layer
 * that moved the number, which is exactly the precedence the audit and the UI report.
 */
export function publishMarket(layers: PublishLayers): PublishedMarket {
  const { feed, market, homeTeam, awayTeam } = layers
  let sels = feed.map((s) => ({ ...s }))
  let source: PublishSource = 'feed'

  // Layer 1 → 2: house/market margin (reprice the juice).
  const method: MarginMethod = layers.marginMethod ?? 'proportional'
  if (layers.margin != null) {
    sels = reprice(sels, layers.margin, method)
    source = 'margin'
  }

  // Layer 3: league/market adjustments — line moves + directional shading.
  if (layers.lineShift && market !== 'moneyline') {
    sels = sels.map((s) => shiftLine(s, market, homeTeam, awayTeam, layers.lineShift!))
    source = 'adjustment'
  }
  if (layers.shadeBps) {
    // Shade around the margin already applied (or a neutral 0 if the feed price stands).
    sels = shade(sels, layers.shadeBps, layers.margin ?? 0, method)
    source = 'adjustment'
  }

  // Layer 4: manual override — pins the number and wins. Capture the drift first.
  let overrideDrift: number | undefined
  if (layers.override && (layers.override.odds || layers.override.line != null)) {
    const computedHome = sels.find((s) => s.pick === 'home' || s.pick === 'over')?.odds
    if (layers.override.odds && computedHome != null) {
      overrideDrift = layers.override.odds[0] - computedHome
    }
    sels = sels.map((s) => applyOverride(s, market, homeTeam, awayTeam, layers.override!))
    source = 'override'
  }

  return { sels, source, overrideDrift }
}

function applyOverride(
  sel: Selection,
  market: MarketKind,
  homeTeam: string,
  awayTeam: string,
  ov: LineOverride,
): Selection {
  let out = { ...sel }
  if (ov.odds) {
    const isFirst = sel.pick === 'home' || sel.pick === 'over'
    out = { ...out, odds: isFirst ? ov.odds[0] : ov.odds[1] }
  }
  if (ov.line != null && market !== 'moneyline') {
    if (market === 'spread') {
      const newLine = sel.pick === 'home' ? ov.line : -ov.line
      const team = sel.pick === 'home' ? homeTeam : awayTeam
      out = { ...out, line: newLine, label: `${team} ${sgn(newLine)}` }
    } else {
      const side = sel.pick === 'over' ? 'Over' : 'Under'
      out = { ...out, line: ov.line, label: `${side} ${ov.line}` }
    }
  }
  return out
}

/* ========================== the house-margin config ========================= */

interface HouseMarginConfig {
  /** The across-the-board hold, or null to leave markets at the feed price. */
  global: number | null
  /** Per-league×market overrides, keyed `${league}|${market}`. */
  matrix: Record<string, number>
}

const MARGIN_CAP = 0.25
const store = createStore({ namespace: 'dimebag' })
const HOUSE: Doc<HouseMarginConfig> = persistedDoc<HouseMarginConfig>(store, 'lines.houseMargin', {
  version: 1,
  initial: { global: null, matrix: {} },
})

let house: HouseMarginConfig = HOUSE.load()
const houseListeners = new Set<() => void>()
let houseVersion = 0
function houseBump(): void {
  HOUSE.save(house)
  houseVersion += 1
  houseListeners.forEach((l) => l())
}

const clampMargin = (m: number) => Math.max(0, Math.min(MARGIN_CAP, m))
const mkey = (league: string, market: MarketKind) => `${league}|${market}`

export function subscribeHouseMargin(l: () => void): () => void {
  houseListeners.add(l)
  return () => houseListeners.delete(l)
}
export function getHouseMarginVersion(): number {
  return houseVersion
}

/** The across-the-board hold (null = feed price). */
export function getHouseMargin(): number | null {
  return house.global
}
export function setHouseMargin(margin: number | null): void {
  house = { ...house, global: margin == null ? null : clampMargin(margin) }
  houseBump()
}

/** A per-league×market hold (null clears it). */
export function getLeagueMarketMargin(league: string, market: MarketKind): number | undefined {
  return house.matrix[mkey(league, market)]
}
export function setLeagueMarketMargin(league: string, market: MarketKind, margin: number | null): void {
  const matrix = { ...house.matrix }
  if (margin == null) delete matrix[mkey(league, market)]
  else matrix[mkey(league, market)] = clampMargin(margin)
  house = { ...house, matrix }
  houseBump()
}

/**
 * The effective margin for a market and its source, lowest-precedence first:
 *   per-market (overlay) > league×market matrix > global house > feed (none).
 * `marketMargin` is the per-event-market value the overlay holds, if any.
 */
export function effectiveMargin(
  league: string,
  market: MarketKind,
  marketMargin?: number,
): { margin: number | null; source: 'market' | 'matrix' | 'house' | 'feed' } {
  if (marketMargin != null) return { margin: marketMargin, source: 'market' }
  const cell = house.matrix[mkey(league, market)]
  if (cell != null) return { margin: cell, source: 'matrix' }
  if (house.global != null) return { margin: house.global, source: 'house' }
  return { margin: null, source: 'feed' }
}

/** Whether any house margin is configured (global or any matrix cell) — a cheap guard
 *  so the overlay can skip the pipeline entirely when the book is running on feed prices. */
export function houseMarginActive(): boolean {
  return house.global != null || Object.keys(house.matrix).length > 0
}

/** Test/reset helper. */
export function resetHouseMargin(): void {
  house = { global: null, matrix: {} }
  houseBump()
}

/* =============================== pricing audit ============================== */

export interface PricingAuditEntry {
  id: number
  /** Epoch ms. */
  at: number
  /** Who made the change ('operator' until real staff auth). */
  actor: string
  /** Machine key: margin | line | shade | override | suspend | house. */
  action: string
  /** What it applied to — an event/market/league label. */
  scope: string
  /** Human summary including before→after. */
  detail: string
}
export type PricingAuditDraft = Omit<PricingAuditEntry, 'id' | 'at' | 'actor'> & {
  at?: number
  /** Overrides the module's current actor for this one entry. */
  actor?: string
}

const MAX_AUDIT = 2000
const AUDIT: Doc<PricingAuditEntry[]> = persistedDoc<PricingAuditEntry[]>(store, 'lines.audit', {
  version: 1,
  initial: [],
})
const auditLoaded = AUDIT.load()
const auditLog: PricingAuditEntry[] = Array.isArray(auditLoaded) ? auditLoaded.slice(-MAX_AUDIT) : []
let auditSeq = auditLog.reduce((mx, e) => Math.max(mx, e.id), 0)
let auditSnapshot: PricingAuditEntry[] = [...auditLog].reverse()
let auditVersion = 0
const auditListeners = new Set<() => void>()

/** Who the overlay attributes changes to. Set once real staff auth lands. */
let actor = 'operator'
export function setPricingActor(who: string): void {
  actor = who || 'operator'
}

export function recordPricingAudit(draft: PricingAuditDraft): PricingAuditEntry {
  const entry: PricingAuditEntry = {
    actor: draft.actor ?? actor,
    action: draft.action,
    scope: draft.scope,
    detail: draft.detail,
    id: ++auditSeq,
    at: draft.at ?? Date.now(),
  }
  auditLog.push(entry)
  if (auditLog.length > MAX_AUDIT) auditLog.splice(0, auditLog.length - MAX_AUDIT)
  AUDIT.save(auditLog)
  auditSnapshot = [...auditLog].reverse()
  auditVersion += 1
  auditListeners.forEach((l) => l())
  return entry
}

/** The pricing audit trail, newest first (stable reference between changes). */
export function getPricingAudit(): PricingAuditEntry[] {
  return auditSnapshot
}
export function subscribePricingAudit(l: () => void): () => void {
  auditListeners.add(l)
  return () => auditListeners.delete(l)
}
export function getPricingAuditVersion(): number {
  return auditVersion
}

/* ============================ alternate lines ============================== */

/** Derive an alt-line ladder around a main spread/total: each rung steps the line by
 *  `step` and re-prices off a standard ~0.10-prob-per-point curve, capped to sane juice.
 *  Returns rungs of { line, odds:[fav, dog] } (American). Used by the advanced desk. */
export function altLineLadder(
  mainLine: number,
  rungs: number,
  step = 0.5,
  probPerPoint = 0.03,
): Array<{ line: number; odds: [number, number] }> {
  const out: Array<{ line: number; odds: [number, number] }> = []
  for (let k = -rungs; k <= rungs; k++) {
    const line = mainLine + k * step
    // Each point you give the bettor lengthens their side; price the two-way at -110 base
    // shifted by the curve. Home/over prob falls as the line rises against them.
    const homeProb = Math.max(0.05, Math.min(0.95, 0.5 - k * step * probPerPoint))
    const [a, b] = twoWayPrices(homeProb, 0.045, 'proportional')
    out.push({ line, odds: [a.american, b.american] })
  }
  return out
}
