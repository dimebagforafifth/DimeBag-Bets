/**
 * Market-suspension metadata, layered on the EXISTING risk system. The suspended FLAG itself
 * lives in app/risk-controls (the same set the risk desk's auto-suspend flips and that the
 * placement path already blocks on), so a Trading Desk suspension, an auto-suspend on a liability
 * breach, and the exposure view all share ONE source of truth. This store only carries the
 * operator metadata (reason / by / at) keyed by the risk key. Moves no money.
 */

import {
  getSuspendedMarkets,
  isMarketSuspended,
  subscribeRiskControls,
  suspendMarket,
  unsuspendMarket,
} from '../../app/risk-controls.js'
import { createStore, persistedDoc, type Doc } from '../../persistence/index.js'
import type { MarketSuspension, TradingScope } from './types.js'

/** key (risk scope_key) → metadata for an operator-initiated suspension. */
type SuspensionMeta = Record<
  string,
  { scope: TradingScope; reason: string; by: string; at: number }
>

const store = createStore({ namespace: 'dimebag' })
const META: Doc<SuspensionMeta> = persistedDoc<SuspensionMeta>(store, 'trading.suspensions', {
  version: 1,
  initial: {},
})

const meta: SuspensionMeta = META.load()

/** Re-render on any change to the shared risk suspension set. */
export function subscribeSuspensions(l: () => void): () => void {
  return subscribeRiskControls(l)
}

/** Suspend a market/sport (shared flag) with operator metadata. */
export function suspend(input: {
  scope: TradingScope
  scope_key: string
  reason: string
  by: string
  at: number
}): void {
  meta[input.scope_key] = { scope: input.scope, reason: input.reason, by: input.by, at: input.at }
  META.save(meta)
  suspendMarket(input.scope_key) // shared with risk auto-suspend; notifies subscribers
}

/** Lift a suspension (shared flag) and forget its metadata. */
export function unsuspend(scope_key: string): void {
  delete meta[scope_key]
  META.save(meta)
  unsuspendMarket(scope_key)
}

/** Whether a key is currently suspended (delegates to the shared risk flag). */
export function isSuspended(scope_key: string): boolean {
  return isMarketSuspended(scope_key)
}

/** All currently-suspended markets as full records (metadata where we have it, else 'risk'). */
export function listSuspensions(): MarketSuspension[] {
  return getSuspendedMarkets().map((key) => {
    const m = meta[key]
    return {
      scope: m?.scope ?? 'market',
      scope_key: key,
      suspended: true,
      reason: m?.reason ?? 'risk auto-suspend',
      by: m?.by ?? 'risk',
      at: m?.at ?? 0,
    }
  })
}

/** Test reset (metadata only — the shared flag is owned/reset by risk-controls). */
export function __resetSuspensionMeta(): void {
  for (const k of Object.keys(meta)) delete meta[k]
  META.save(meta)
}
