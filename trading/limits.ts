/**
 * Market-limit store — per-scope stake/payout ceilings the gate enforces at placement. The most
 * specific active row that matches a wager wins (market > sport > global). Persisted (mock/local
 * default, off-by-default — an empty store means no extra ceiling beyond core's own limits).
 * Moves no money: the ceiling is checked BEFORE `core.placeWager`, so an over-limit wager is
 * rejected with nothing held.
 */

import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import type { MarketLimit, TimeToEventTier, TradingScope } from './types.js'

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<MarketLimit[]> = persistedDoc<MarketLimit[]>(store, 'trading.limits', {
  version: 1,
  initial: [],
})

let limits: MarketLimit[] = DOC.load()
const listeners = new Set<() => void>()
let version = 0

function notify(): void {
  version += 1
  for (const l of listeners) l()
}
function save(): void {
  DOC.save(limits)
  notify()
}

export function subscribeLimits(l: () => void): () => void {
  listeners.add(l)
  return () => void listeners.delete(l)
}
export function limitsVersion(): number {
  return version
}
export function getLimits(): readonly MarketLimit[] {
  return limits
}

let seq = 0

export interface SetLimitInput {
  scope: TradingScope
  scope_key: string
  max_stake_cents: number
  max_payout_cents: number
  applies_inplay?: boolean
  time_to_event_tier?: TimeToEventTier
  set_by: string
}

/** Add (or replace, by scope+key+tier) a limit. */
export function setLimit(input: SetLimitInput): MarketLimit {
  const tier = input.time_to_event_tier ?? 'mid'
  const row: MarketLimit = {
    id: `lim_${(seq += 1)}`,
    scope: input.scope,
    scope_key: input.scope_key,
    max_stake_cents: Math.max(0, Math.round(input.max_stake_cents)),
    max_payout_cents: Math.max(0, Math.round(input.max_payout_cents)),
    applies_inplay: input.applies_inplay ?? true,
    time_to_event_tier: tier,
    set_by: input.set_by,
    active: true,
  }
  limits = [
    ...limits.filter(
      (l) =>
        !(
          l.scope === input.scope &&
          l.scope_key === input.scope_key &&
          l.time_to_event_tier === tier
        ),
    ),
    row,
  ]
  save()
  return row
}

export function removeLimit(id: string): void {
  const before = limits.length
  limits = limits.filter((l) => l.id !== id)
  if (limits.length !== before) save()
}

/**
 * Context a wager presents to the limit resolver. `tier` is OPTIONAL: when undefined (the book is
 * pre-match and placement can't compute a real tier yet) a limit applies REGARDLESS of its tier,
 * so a manager's limit is NEVER silently ignored. // SEAM (live betting): pass the real tier +
 * inplay (derived from the event start) so resolveLimit can narrow to tier-specific ceilings.
 */
export interface LimitContext {
  marketType: string
  marketId?: string
  sport?: string
  inplay: boolean
  tier?: TimeToEventTier
}

/** Match specificity, most → least: exact marketId (4), marketType family (3), sport (2),
 *  global (1). A more specific row wins; ties break to the STRICTER row (see resolveLimit), so
 *  resolution is deterministic and never insertion-order dependent. */
function matchSpecificity(l: MarketLimit, ctx: LimitContext): number {
  switch (l.scope) {
    case 'market':
      if (ctx.marketId != null && l.scope_key === ctx.marketId) return 4
      return l.scope_key === ctx.marketType ? 3 : 0
    case 'sport':
      return l.scope_key === ctx.sport ? 2 : 0
    case 'global':
      return 1
  }
}

/** Whether a limit row applies to a wager context (active + scope match + tier + in-play rule). */
function applies(l: MarketLimit, ctx: LimitContext): boolean {
  if (!l.active) return false
  // Tier only narrows when the context KNOWS its tier; an unknown tier matches every row.
  if (ctx.tier != null && l.time_to_event_tier !== ctx.tier) return false
  if (ctx.inplay && !l.applies_inplay) return false
  return matchSpecificity(l, ctx) > 0
}

/**
 * The effective limit for a wager: the MOST-SPECIFIC applicable active row; among rows of equal
 * specificity, the STRICTEST (lowest max_stake_cents, then lowest max_payout_cents). Deterministic
 * — independent of store insertion order, so a loose family limit can never shadow a tight
 * per-market one (and vice-versa, the tighter wins on a true tie).
 */
export function resolveLimit(ctx: LimitContext): MarketLimit | null {
  let best: MarketLimit | null = null
  let bestSpec = 0
  for (const l of limits) {
    if (!applies(l, ctx)) continue
    const spec = matchSpecificity(l, ctx)
    if (spec > bestSpec || (spec === bestSpec && best != null && stricter(l, best))) {
      best = l
      bestSpec = spec
    }
  }
  return best
}

/** True when `a` is a strictly tighter ceiling than `b`. */
function stricter(a: MarketLimit, b: MarketLimit): boolean {
  if (a.max_stake_cents !== b.max_stake_cents) return a.max_stake_cents < b.max_stake_cents
  return a.max_payout_cents < b.max_payout_cents
}

/** Test reset. */
export function __resetLimits(): void {
  limits = []
  seq = 0
  save()
}
