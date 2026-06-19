/**
 * Pricing config the Trading Desk writes and Lane A's pipeline (devig → applyMargin) consumes.
 *
 * // SEAM (Lane A / wiring): Lane A OWNS `pricing_config` and devig/applyMargin. This store is the
 * interface Lane B writes against so the Trading Desk is functional now; the wiring pass replaces
 * it with A's authoritative store, keeping the PricingConfigRow shape. Build ON lib/odds/pricing
 * (Round 1's correlation work) — extend, never revert.
 *
 * Resolution is global → per-sport → per-market (a more specific row overrides the global one,
 * field by field). MANAGER vs AGENT: a manager sets any margin; an agent inherits and may only
 * RAISE margin (tighten) — `setMargin` clamps an agent edit up to the manager floor, so an agent
 * can never widen a price below the manager's floor. Mock/local default; moves no money.
 */

import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import { DEFAULT_MARGIN, type MarginPosture as EngineMarginPosture } from '../lib/odds/pricing.js'
import type { DevigMethod, PricingConfigRow, TradingScope } from './types.js'

const KEY = (scope: TradingScope, key: string): string => `${scope}:${key}`

const DEFAULT_GLOBAL: PricingConfigRow = {
  scope: 'global',
  key: '',
  margin: DEFAULT_MARGIN, // 0.045
  margin_floor: 0.02, // manager's hard minimum
  posture: 'balanced',
  devig_method: 'multiplicative',
}

type ConfigMap = Record<string, PricingConfigRow>

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<ConfigMap> = persistedDoc<ConfigMap>(store, 'trading.pricing-config', {
  version: 1,
  initial: { [KEY('global', '')]: DEFAULT_GLOBAL },
})

let config: ConfigMap = ensureGlobal(DOC.load())
const listeners = new Set<() => void>()
let version = 0

function ensureGlobal(c: ConfigMap): ConfigMap {
  if (!c[KEY('global', '')]) c[KEY('global', '')] = { ...DEFAULT_GLOBAL }
  return c
}
function notify(): void {
  version += 1
  for (const l of listeners) l()
}
function save(): void {
  DOC.save(config)
  notify()
}

export function subscribePricingConfig(l: () => void): () => void {
  listeners.add(l)
  return () => void listeners.delete(l)
}
export function pricingConfigVersion(): number {
  return version
}

/** The global row (the manager's book-wide defaults). */
export function globalRow(): PricingConfigRow {
  return config[KEY('global', '')] ?? DEFAULT_GLOBAL
}

/** The raw row for a scope+key, or undefined if unset (inherits global). */
export function rowFor(scope: TradingScope, key: string): PricingConfigRow | undefined {
  return scope === 'global' ? globalRow() : config[KEY(scope, key)]
}

/** All explicitly-set rows (for the tile to list). */
export function allRows(): PricingConfigRow[] {
  return Object.values(config)
}

/**
 * The EFFECTIVE config for a market: start from global, override with the per-sport row, then the
 * per-market row, field by field. This is what Lane A's applyMargin should resolve against.
 */
export function effectiveConfig(opts: { sport?: string; marketType?: string }): PricingConfigRow {
  let row = { ...globalRow() }
  const sportRow = opts.sport ? config[KEY('sport', opts.sport)] : undefined
  if (sportRow) row = { ...row, ...stripIdentity(sportRow) }
  const marketRow = opts.marketType ? config[KEY('market', opts.marketType)] : undefined
  if (marketRow) row = { ...row, ...stripIdentity(marketRow) }
  const floor = globalRow().margin_floor
  // Never resolve below the manager floor — and never a non-finite margin (a bad/NaN input falls
  // back to the floor, so the clamp can't be bypassed). Report the ENFORCED floor, not a stale
  // per-row value, so the resolved row is self-consistent.
  row.margin = Number.isFinite(row.margin) ? Math.max(row.margin, floor) : floor
  row.margin_floor = floor
  return row
}

function stripIdentity(r: PricingConfigRow): Partial<PricingConfigRow> {
  const { scope: _s, key: _k, ...rest } = r
  void _s
  void _k
  return rest
}

/** The de-vig method for a scope (effective). */
export function devigMethodFor(opts: { sport?: string; marketType?: string }): DevigMethod {
  return effectiveConfig(opts).devig_method
}

/** The posture for a scope (effective), as Lane A's engine posture type. */
export function postureFor(opts: { sport?: string; marketType?: string }): EngineMarginPosture {
  return effectiveConfig(opts).posture as EngineMarginPosture
}

/** The book-wide margin floor a manager has set (agents can't widen below it). */
export function marginFloor(): number {
  return globalRow().margin_floor
}

function upsert(scope: TradingScope, key: string, patch: Partial<PricingConfigRow>): void {
  const base = rowFor(scope, key) ?? {
    scope,
    key,
    margin: globalRow().margin,
    margin_floor: globalRow().margin_floor,
    posture: globalRow().posture,
    devig_method: globalRow().devig_method,
  }
  config = { ...config, [KEY(scope, key)]: { ...base, ...patch, scope, key } }
  save()
}

/**
 * Set a margin for a scope. `asAgent` clamps the value UP to the manager floor — an agent can
 * tighten (raise) margin but can never set it below the manager's floor (so they can't widen a
 * price beyond what the manager allows). A manager edit can also lower the floor itself.
 */
export function setMargin(
  scope: TradingScope,
  key: string,
  margin: number,
  opts: { asAgent?: boolean } = {},
): void {
  const floor = opts.asAgent ? globalRow().margin_floor : 0
  // A non-finite input (empty/NaN field) can't slip past the floor — fall back to the floor.
  const safe = Number.isFinite(margin) ? margin : floor
  upsert(scope, key, { margin: Math.max(floor, safe) })
}

/** Manager-only: set the book-wide margin floor agents inherit. */
export function setMarginFloor(floor: number): void {
  const g = globalRow()
  config = {
    ...config,
    [KEY('global', '')]: {
      ...g,
      margin_floor: Math.max(0, floor),
      margin: Math.max(g.margin, Math.max(0, floor)),
    },
  }
  save()
}

export function setPosture(
  scope: TradingScope,
  key: string,
  posture: PricingConfigRow['posture'],
): void {
  upsert(scope, key, { posture })
}
export function setDevigMethod(scope: TradingScope, key: string, devig_method: DevigMethod): void {
  upsert(scope, key, { devig_method })
}

/** Test reset. */
export function __resetPricingConfig(): void {
  config = { [KEY('global', '')]: { ...DEFAULT_GLOBAL } }
  save()
}
