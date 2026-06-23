/**
 * The same-game BET BUILDER model — a guided UX layer over the EXISTING slip + SGP
 * correlation engine. It does NOT fork pricing or open a new money path:
 *
 *  - `builderGroups` lays one game's markets out as a buildable menu (game lines + a
 *    block per player prop), the way a major book's "build a bet" surface does.
 *  - `selectionAvailability` tells the UI, for each pick, whether it's already on the
 *    builder, addable, BLOCKED (it contradicts a leg already chosen — decided by the
 *    canonical `validateSlip` hard-block matrix, so the builder and placement agree),
 *    or off-board (the price is pulled or the desk has suspended its market).
 *  - `builderQuote` prices the running ticket through `combinedDecimal` — the same SGP
 *    correlation path the slip and placement use (same-game legs reprice with
 *    correlation, never naive-multiplied).
 *
 * Placement + settlement stay on the existing `core` path (placement.placeBookBet →
 * placeWager / resolveWager). This module is pure and moves no money.
 */

import type {
  NormalizedEvent,
  NormalizedMarket,
  Selection,
} from '../../lib/odds/contract.js'
import { isSuspended } from '../../features/trading/suspensions.js'
import { combinedDecimal, legFromSelection, type SlipLeg } from './slip.js'
import { profitCents as profitOf, toReturnCents } from './odds-format.js'
import {
  firstBlockMessage,
  validateSlip,
  type BlockReason,
} from './sgp-rules.js'

const STAT_LABEL: Record<string, string> = {
  points: 'Points',
  rebounds: 'Rebounds',
  assists: 'Assists',
  passing_yards: 'Passing Yards',
  rushing_yards: 'Rushing Yards',
  goals: 'Goals',
}

/** A buildable market in the builder menu — a game line or one player's prop. */
export interface BuilderGroup {
  marketId: string
  /** 'game' for moneyline/spread/total, 'prop' for a player prop. */
  kind: 'game' | 'prop'
  /** Section heading, e.g. "Moneyline", "Spread", "L. James — Points". */
  title: string
  market: NormalizedMarket
  selections: Selection[]
}

const GAME_TITLE: Partial<Record<NormalizedMarket['type'], string>> = {
  moneyline: 'Moneyline',
  spread: 'Spread',
  total: 'Total',
}

/**
 * Group one event's markets for the guided builder: game lines first (moneyline,
 * spread, total — main line then any alternate ladder), then a block per player prop.
 * Markets with no selections are dropped (nothing to build). Pure — order is stable.
 */
export function builderGroups(event: NormalizedEvent): BuilderGroup[] {
  const groups: BuilderGroup[] = []
  const ordered: NormalizedMarket['type'][] = ['moneyline', 'spread', 'total']
  for (const type of ordered) {
    const markets = event.markets.filter((m) => m.type === type && m.selections.length > 0)
    markets.forEach((market, i) => {
      const base = GAME_TITLE[type] ?? type
      groups.push({
        marketId: market.marketId,
        kind: 'game',
        title: i === 0 ? base : `Alternate ${base}`,
        market,
        selections: market.selections,
      })
    })
  }
  for (const market of event.markets.filter((m) => m.type === 'prop' && m.selections.length > 0)) {
    const stat = market.statId ? (STAT_LABEL[market.statId] ?? market.statId) : 'Prop'
    groups.push({
      marketId: market.marketId,
      kind: 'prop',
      title: `${market.playerId ?? 'Player'} — ${stat}`,
      market,
      selections: market.selections,
    })
  }
  return groups
}

/** Whether a market is suspended by the trading/risk desk — same flag the placement gate reads. */
function marketSuspended(event: NormalizedEvent, market: NormalizedMarket): boolean {
  return (
    isSuspended(market.type) ||
    isSuspended(market.marketId) ||
    (event.sport != null && isSuspended(event.sport))
  )
}

/** A pick's status relative to the legs already on the builder. */
export type LegAvailability =
  | { state: 'added' }
  | { state: 'available' }
  | { state: 'blocked'; reason: BlockReason; message: string }
  | { state: 'off-board' }

/**
 * How a candidate selection stands against the current builder:
 *  - `added`     — already a leg.
 *  - `off-board` — its price is pulled (`available` false) or the desk has suspended its
 *                  market/sport; can't be built (placement would reject it too).
 *  - `blocked`   — adding it would contradict a chosen leg. Decided by trial through the
 *                  CANONICAL `validateSlip` block matrix (opposing/nested markets), so the
 *                  builder greys out exactly what placement would refuse — with its message.
 *  - `available` — addable.
 *
 * `suspended` is injectable for tests; it defaults to the live desk flag.
 */
export function selectionAvailability(
  legs: SlipLeg[],
  event: NormalizedEvent,
  market: NormalizedMarket,
  sel: Selection,
  suspended: (event: NormalizedEvent, market: NormalizedMarket) => boolean = marketSuspended,
): LegAvailability {
  if (legs.some((l) => l.key === sel.selectionId)) return { state: 'added' }
  if (!sel.available || suspended(event, market)) return { state: 'off-board' }
  const candidate = legFromSelection(event, market, sel)
  const block = validateSlip([...legs, candidate]).blocks.find((b) => b.keys.includes(candidate.key))
  if (block) return { state: 'blocked', reason: block.reason, message: block.message }
  return { state: 'available' }
}

/** The live price + placeability of the running builder ticket. */
export interface BuilderQuote {
  /** Deduped survivors — what would actually be priced/placed (never the raw input). */
  legs: SlipLeg[]
  /** The running combined price: the correlated SGP decimal (≥2 legs) or the lone decimal. */
  decimal: number
  /** True once ≥2 same-game legs ride together (priced with correlation). */
  sgp: boolean
  /** Placeable: the slip validates and has at least one leg. */
  ok: boolean
  /** First block message when the build is refused, else null. */
  blockMessage: string | null
  /** Leg keys the validation flags (so the UI can mark them). */
  conflictKeys: string[]
  totalStakeCents: number
  toReturnCents: number
  profitCents: number
}

/**
 * Price the running builder ticket through the existing engine: `validateSlip` (dedupe +
 * hard-block matrix + leg cap) then `combinedDecimal` (the SGP correlation path for ≥2
 * same-game legs; the lone decimal for one). Pure — no money moves; placement settles it.
 */
export function builderQuote(legs: SlipLeg[], stakeCents: number): BuilderQuote {
  const validation = validateSlip(legs)
  const survivors = validation.legs
  const priced =
    survivors.length >= 2
      ? combinedDecimal(survivors)
      : { decimal: survivors[0]?.price.decimal ?? 1, sgp: false }
  const stake = Math.max(0, Math.round(stakeCents))
  const ret = stake > 0 && survivors.length > 0 ? toReturnCents(stake, priced.decimal) : 0
  return {
    legs: survivors,
    decimal: priced.decimal,
    sgp: priced.sgp,
    ok: validation.ok && survivors.length >= 1,
    blockMessage: firstBlockMessage(validation),
    conflictKeys: validation.blocks.flatMap((b) => b.keys),
    totalStakeCents: stake,
    toReturnCents: ret,
    profitCents: stake > 0 && survivors.length > 0 ? profitOf(stake, priced.decimal) : 0,
  }
}

/**
 * Legs that are no longer on the live board — the leg's market or selection has been pulled
 * (`available` false), vanished from the slate, or the desk has suspended its market. The UI
 * gates placement on this (a stale leg can't ride), mirroring the cash-out suspension freeze.
 * `suspended` is injectable for tests. Returns the off-board leg keys.
 */
export function legsOffBoard(
  legs: SlipLeg[],
  event: NormalizedEvent,
  suspended: (event: NormalizedEvent, market: NormalizedMarket) => boolean = marketSuspended,
): string[] {
  const off: string[] = []
  for (const leg of legs) {
    const market = event.markets.find((m) => m.marketId === leg.marketId)
    const sel = market?.selections.find((s) => s.selectionId === leg.key)
    if (!market || !sel || !sel.available || suspended(event, market)) off.push(leg.key)
  }
  return off
}

/**
 * Toggle a selection on the builder: remove it if present, else add it (locked at its
 * display price via `legFromSelection`). The builder is single-game by construction — the
 * caller always passes the open event — so adding simply appends; dedupe/validation is
 * handled by `validateSlip` at quote time. Returns a new leg list (never mutates).
 */
export function toggleBuilderLeg(
  legs: SlipLeg[],
  event: NormalizedEvent,
  market: NormalizedMarket,
  sel: Selection,
): SlipLeg[] {
  if (legs.some((l) => l.key === sel.selectionId)) {
    return legs.filter((l) => l.key !== sel.selectionId)
  }
  return [...legs, legFromSelection(event, market, sel)]
}
