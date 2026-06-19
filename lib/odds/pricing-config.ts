/**
 * pricing_config — the operator's de-vig + margin settings, as data (SGO pricing pipeline).
 *
 * Rows at three scopes, most-specific wins: GLOBAL (the book default), per-SPORT, and
 * per-MARKET (a market type, optionally within a sport). Each row carries a de-vig method, a
 * base margin in bps, a posture label, and a favorite-shade in bps — exactly the knobs
 * `pricing-engine.applyMargin` consumes. Lane B's Trading Desk tile reads/writes these.
 *
 * Persisted on the standard tenant-scoped doc seam (localStorage default; a `pricing_config`
 * table under Supabase — migration 0008). OFF-BY-DEFAULT: seeded with ONE global row at 450 bps
 * / power, so a book with no configuration reproduces today's pricing and the bytes are
 * identical with no Supabase keys.
 */

import { createStore, persistedDoc, type Doc } from '../../persistence/index.js'
import type { MarketType } from './contract.js'
import { DEFAULT_DEVIG_METHOD, type DevigMethod } from './devig.js'
import {
  PRICING_POSTURE_PRESETS,
  type MarginSettings,
  type PricePosture,
} from './pricing-engine.js'

/** One pricing_config row. The scope + (sportId, marketType) form its identity. */
export interface PricingConfigRow {
  scope: 'global' | 'sport' | 'market'
  /** Set for 'sport' and (optionally) 'market' scope — the SGO sportID, upper-cased. */
  sportId?: string
  /** Set for 'market' scope — which market type this row prices. */
  marketType?: MarketType
  devigMethod: DevigMethod
  /** Base house margin in bps (450 = today's default). */
  marginBps: number
  posture: PricePosture
  /** Extra margin in bps applied to the favorite only. */
  favoriteShadeBps: number
  /**
   * Manager governance floor in bps — the lowest `marginBps` an AGENT may set (an agent can't
   * thin the book's hold below this). Authoritative on the GLOBAL row (per-row values on
   * sport/market rows are ignored; `marginFloor()` reads the global row). Optional for backward
   * compatibility with rows persisted before this field existed (reads default to
   * `DEFAULT_MARGIN_FLOOR_BPS`). Mirrors Lane B's validated `margin_floor` governance.
   */
  marginFloorBps?: number
}

/** Default agent margin floor (bps) — Lane B's 0.02 floor == 200 bps. */
export const DEFAULT_MARGIN_FLOOR_BPS = 200

/** The single global row a book starts with — 450 bps / power, reproducing today's pricing. */
export const DEFAULT_PRICING_ROW: PricingConfigRow = {
  scope: 'global',
  devigMethod: DEFAULT_DEVIG_METHOD,
  marginBps: 450,
  posture: 'recreational',
  favoriteShadeBps: 0,
  marginFloorBps: DEFAULT_MARGIN_FLOOR_BPS,
}

/** The margin knobs a row resolves to (for `pricing-engine.applyMargin` / `priceMarket`). */
export function toMarginSettings(row: PricingConfigRow): MarginSettings {
  return { marginBps: row.marginBps, favoriteShadeBps: row.favoriteShadeBps, devigMethod: row.devigMethod }
}

/** Stamp a posture preset onto a row (the Trading Desk "adopt sharp/recreational" action):
 *  copies the preset's margin/shade/method and labels the row with the posture. */
export function applyPosturePreset(row: PricingConfigRow, posture: PricePosture): PricingConfigRow {
  if (posture === 'custom') return { ...row, posture }
  const preset = PRICING_POSTURE_PRESETS[posture]
  return { ...row, posture, marginBps: preset.marginBps, favoriteShadeBps: preset.favoriteShadeBps, devigMethod: preset.devigMethod }
}

/** Identity key for a row (upsert / dedupe). */
function rowKey(scope: PricingConfigRow['scope'], sportId?: string, marketType?: MarketType): string {
  return `${scope}:${(sportId ?? '').toUpperCase()}:${marketType ?? ''}`
}
const keyOf = (r: PricingConfigRow): string => rowKey(r.scope, r.sportId, r.marketType)

/**
 * Resolve the effective row for a (sport, market): the most specific match wins —
 * market (by marketType, and sportId if the row scopes one) → sport (by sportId) → global.
 * Falls back to the default row if somehow no global exists. Pure.
 */
export function resolvePricingRow(
  rows: PricingConfigRow[],
  sportId?: string,
  marketType?: MarketType,
): PricingConfigRow {
  const sid = sportId?.toUpperCase()
  const market = rows.find(
    (r) =>
      r.scope === 'market' &&
      r.marketType === marketType &&
      (r.sportId == null || r.sportId.toUpperCase() === sid),
  )
  if (market) return market
  const sport = rows.find((r) => r.scope === 'sport' && r.sportId?.toUpperCase() === sid)
  if (sport) return sport
  return rows.find((r) => r.scope === 'global') ?? DEFAULT_PRICING_ROW
}

/* --------------------------------- the store ------------------------------- */

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<PricingConfigRow[]> = persistedDoc<PricingConfigRow[]>(store, 'odds.pricingConfig', {
  version: 1,
  initial: [DEFAULT_PRICING_ROW],
})

let rows: PricingConfigRow[] = sanitize(DOC.load())
let version = 0
const listeners = new Set<() => void>()

/** A stored doc must always carry a global row; a corrupt/empty doc falls back to the default. */
function sanitize(loaded: PricingConfigRow[] | null): PricingConfigRow[] {
  if (!Array.isArray(loaded) || loaded.length === 0) return [DEFAULT_PRICING_ROW]
  return loaded.some((r) => r.scope === 'global') ? loaded : [DEFAULT_PRICING_ROW, ...loaded]
}

function notify(): void {
  DOC.save(rows)
  version += 1
  listeners.forEach((l) => l())
}

export function subscribePricingConfig(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function getPricingConfigVersion(): number {
  return version
}

/** All rows (global first), stable enough for a console table. */
export function getPricingRows(): PricingConfigRow[] {
  return rows
}

/** The effective row for a (sport, market) — what the pipeline prices with. */
export function resolvePricingConfig(sportId?: string, marketType?: MarketType): PricingConfigRow {
  return resolvePricingRow(rows, sportId, marketType)
}

/** The margin settings for a (sport, market), ready for `applyMargin`/`priceMarket`. */
export function resolveMarginSettings(sportId?: string, marketType?: MarketType): MarginSettings {
  return toMarginSettings(resolvePricingConfig(sportId, marketType))
}

/** Create or replace a row (Trading Desk write). Keyed by scope + sport + market. */
export function upsertPricingRow(row: PricingConfigRow): void {
  const k = keyOf(row)
  const i = rows.findIndex((r) => keyOf(r) === k)
  rows = i >= 0 ? rows.map((r) => (keyOf(r) === k ? row : r)) : [...rows, row]
  notify()
}

/** Remove a row (never the global default — it's the book's floor). */
export function removePricingRow(scope: PricingConfigRow['scope'], sportId?: string, marketType?: MarketType): void {
  if (scope === 'global') return
  const k = rowKey(scope, sportId, marketType)
  rows = rows.filter((r) => keyOf(r) !== k)
  notify()
}

/** Adopt a posture preset on a row identified by scope+sport+market (Trading Desk action). */
export function setPosture(
  posture: PricePosture,
  scope: PricingConfigRow['scope'] = 'global',
  sportId?: string,
  marketType?: MarketType,
): void {
  const k = rowKey(scope, sportId, marketType)
  const existing = rows.find((r) => keyOf(r) === k) ?? { scope, sportId, marketType, ...toMarginSettings(DEFAULT_PRICING_ROW), posture }
  upsertPricingRow(applyPosturePreset(existing as PricingConfigRow, posture))
}

/* ----------------------- governance (collapsed from Lane B) ---------------- */

/** The book's global row (the default + the home of the manager margin floor). */
export function globalRow(): PricingConfigRow {
  return rows.find((r) => r.scope === 'global') ?? DEFAULT_PRICING_ROW
}

/** The manager's agent-margin floor in bps (authoritative on the global row). */
export function marginFloor(): number {
  return globalRow().marginFloorBps ?? DEFAULT_MARGIN_FLOOR_BPS
}

/** Set the manager's agent-margin floor (bps, ≥0). A MANAGER action — an agent never calls this.
 *  The manager may lower it. Stored on the global row. */
export function setMarginFloor(bps: number): void {
  const floor = Number.isFinite(bps) ? Math.max(0, Math.round(bps)) : 0
  upsertPricingRow({ ...globalRow(), scope: 'global', marginFloorBps: floor })
}

/** Find the row at (scope, sport, market), or synthesize one off the default margin knobs. */
function rowAt(scope: PricingConfigRow['scope'], sportId?: string, marketType?: MarketType): PricingConfigRow {
  const k = rowKey(scope, sportId, marketType)
  const existing = rows.find((r) => keyOf(r) === k)
  if (existing) return existing
  return { scope, sportId, marketType, ...toMarginSettings(DEFAULT_PRICING_ROW), posture: 'custom' }
}

/**
 * Set a row's base margin (bps). Manual edit ⇒ posture becomes 'custom'. GOVERNANCE: when
 * `asAgent`, the value is clamped UP to the manager's `marginFloor()` (an agent can't thin the
 * hold below the floor); a non-finite value also resolves to the floor. The manager (no
 * `asAgent`) may set any non-negative margin, including below the floor. Capped at 5000 bps
 * (the pricing_config column bound). Mirrors Lane B's validated agent-clamp.
 */
export function setMargin(
  marginBps: number,
  scope: PricingConfigRow['scope'] = 'global',
  sportId?: string,
  marketType?: MarketType,
  opts: { asAgent?: boolean } = {},
): void {
  const floor = marginFloor()
  let bps = Number.isFinite(marginBps) ? Math.round(marginBps) : floor
  if (opts.asAgent) bps = Math.max(bps, floor) // agents cannot go below the manager floor
  bps = Math.max(0, Math.min(5000, bps))
  upsertPricingRow({ ...rowAt(scope, sportId, marketType), scope, sportId, marketType, marginBps: bps, posture: 'custom' })
}

/** Set a row's de-vig method (Trading Desk action). Leaves margin/posture untouched. */
export function setDevigMethod(
  devigMethod: DevigMethod,
  scope: PricingConfigRow['scope'] = 'global',
  sportId?: string,
  marketType?: MarketType,
): void {
  upsertPricingRow({ ...rowAt(scope, sportId, marketType), scope, sportId, marketType, devigMethod })
}

/** Test/boot helper: restore the single default global row. */
export function __resetPricingConfig(): void {
  rows = [DEFAULT_PRICING_ROW]
  notify()
}
