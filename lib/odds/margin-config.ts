/**
 * The LIVE operator margin config — the one place the running book's hold posture lives.
 *
 * The console margin setting writes it; the poller reads it each cycle, so changing the
 * posture reprices the very next poll. It is a framework-agnostic external store
 * (subscribe / getSnapshot), mirrored into React with `useSyncExternalStore` — the same
 * pattern as the app's other stores. It holds only a `MarginConfig` (a few rates), never
 * money — pricing math still runs through `pricing.ts`, money still through `core`.
 *
 * It defaults to DEFAULT_MARGIN_CONFIG (the legacy flat 4.5%), so an untouched book prices
 * byte-for-byte as before this control existed, and it stays in memory (no Supabase) so the
 * keyless/local default is unchanged.
 */

import {
  DEFAULT_MARGIN_CONFIG,
  MARGIN_POSTURES,
  MAX_MARGIN,
  type MarginConfig,
  type MarginPosture,
} from './pricing.js'
import type { MarketType } from './contract.js'

let current: MarginConfig = cloneConfig(DEFAULT_MARGIN_CONFIG)
let version = 0
const listeners = new Set<() => void>()

function emit(): void {
  version++
  for (const l of listeners) l()
}

/** The live operator margin config. Pass to the poller / `resolveMargin`. */
export function getMarginConfig(): MarginConfig {
  return current
}

/** Monotonic version counter — the `getSnapshot` for `useSyncExternalStore`. */
export function getMarginVersion(): number {
  return version
}

/** Subscribe to config changes; returns an unsubscribe. */
export function subscribeMargin(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Replace the whole config (base + per-market overrides). Rates are clamped to a sane range. */
export function setMarginConfig(config: MarginConfig): void {
  current = normalizeConfig(config)
  emit()
}

/** Set just the operator's base (default) margin, keeping any per-market overrides. */
export function setBaseMargin(base: number): void {
  setMarginConfig({ ...current, base })
}

/** Set (or clear, with null) the override for one market type. */
export function setMarketMargin(market: MarketType, rate: number | null): void {
  const perMarket: Partial<Record<MarketType, number>> = { ...current.perMarket }
  if (rate == null) delete perMarket[market]
  else perMarket[market] = rate
  setMarginConfig({ ...current, perMarket })
}

/** Adopt a named posture preset (the operator can then fine-tune individual markets). */
export function applyPosture(posture: MarginPosture): void {
  setMarginConfig(cloneConfig(MARGIN_POSTURES[posture]))
}

/** Test hook: restore the default flat config and reset the version. */
export function __resetMarginConfig(): void {
  current = cloneConfig(DEFAULT_MARGIN_CONFIG)
  version = 0
}

/* ------------------------------- helpers -------------------------------- */

function clampRate(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(MAX_MARGIN, n))
}

function cloneConfig(config: MarginConfig): MarginConfig {
  const out: MarginConfig = { base: config.base }
  if (config.perMarket) out.perMarket = { ...config.perMarket }
  return out
}

/** Clamp every rate and drop any null/empty per-market map. */
function normalizeConfig(config: MarginConfig): MarginConfig {
  const out: MarginConfig = { base: clampRate(config.base) }
  if (config.perMarket) {
    const pm: Partial<Record<MarketType, number>> = {}
    for (const [market, rate] of Object.entries(config.perMarket)) {
      if (rate != null) pm[market as MarketType] = clampRate(rate)
    }
    if (Object.keys(pm).length) out.perMarket = pm
  }
  return out
}
