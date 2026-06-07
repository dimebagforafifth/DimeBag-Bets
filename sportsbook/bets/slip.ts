/**
 * The bet slip (CLAUDE.md §4) — the unifying betting interface a regular book is
 * built around.
 *
 * A slip accumulates selections; from them it works out which bet types are
 * available (single, parlay, round robin, teaser) and prices each. Two legs from
 * the SAME event are "related" and can't be combined in a straight parlay
 * (matching the engine's rule), so the slip surfaces those conflicts.
 *
 * Pure, immutable logic on plain selections — no React, no event/ticket coupling
 * — so a UI can bind to it and it composes with `roundrobin`/`teasers`. It keeps
 * no points; placement/settlement is `core`'s job.
 */

import { parlayDecimalOf, roundRobin, type RoundRobinTicket } from './roundrobin.js'
import { teaserDecimal, teaseLine, type TeaserSport } from './teasers.js'

export type SlipMarket = 'moneyline' | 'spread' | 'total'
export type SlipPick = 'home' | 'away' | 'over' | 'under'

export interface SlipSelection {
  id: string
  eventId: string
  label: string
  market: SlipMarket
  /** Decimal odds locked when the leg was added. */
  decimal: number
  pick?: SlipPick
  /** Spread/total line (the picked side's handicap or the total). */
  line?: number
  /** Sport, for teaser eligibility/points. */
  sport?: TeaserSport
}

export type BetType = 'single' | 'parlay' | 'roundRobin' | 'teaser'

export interface BetSlip {
  selections: SlipSelection[]
}

export function emptySlip(): BetSlip {
  return { selections: [] }
}

/** Add a selection (immutable). A second selection with the same `id` replaces
 *  the first, so re-adding just refreshes the price. */
export function addSelection(slip: BetSlip, sel: SlipSelection): BetSlip {
  if (!(sel.decimal > 1)) throw new Error(`selection decimal must be > 1, got ${sel.decimal}`)
  return { selections: [...slip.selections.filter((s) => s.id !== sel.id), sel] }
}

/** Remove a selection by id (immutable). */
export function removeSelection(slip: BetSlip, id: string): BetSlip {
  return { selections: slip.selections.filter((s) => s.id !== id) }
}

/** Toggle a selection: remove if present (by id), else add. */
export function toggleSelection(slip: BetSlip, sel: SlipSelection): BetSlip {
  return slip.selections.some((s) => s.id === sel.id)
    ? removeSelection(slip, sel.id)
    : addSelection(slip, sel)
}

/** Pairs of selection ids that come from the same event (can't be parlayed). */
export function relatedPairs(slip: BetSlip): [string, string][] {
  const pairs: [string, string][] = []
  const sels = slip.selections
  for (let i = 0; i < sels.length; i++) {
    for (let j = i + 1; j < sels.length; j++) {
      if (sels[i].eventId === sels[j].eventId) pairs.push([sels[i].id, sels[j].id])
    }
  }
  return pairs
}

/** True when no two legs share an event (so they can combine in a parlay). */
export function canCombine(slip: BetSlip): boolean {
  return relatedPairs(slip).length === 0
}

/** Teaser-eligible: ≥2 legs, every leg a spread or total of the SAME sport. */
export function teaserEligible(slip: BetSlip): boolean {
  const sels = slip.selections
  if (sels.length < 2) return false
  const sport = sels[0].sport
  return sels.every(
    (s) => (s.market === 'spread' || s.market === 'total') && s.sport !== undefined && s.sport === sport,
  )
}

/** Which bet types the current slip supports. */
export function availableBetTypes(slip: BetSlip): BetType[] {
  const n = slip.selections.length
  const types: BetType[] = []
  if (n >= 1) types.push('single')
  const combinable = canCombine(slip)
  if (n >= 2 && combinable) types.push('parlay')
  if (n >= 3 && combinable) types.push('roundRobin')
  if (combinable && teaserEligible(slip)) types.push('teaser')
  return types
}

/* --------------------------------- pricing --------------------------------- */

export interface SingleTicket {
  label: string
  decimal: number
  stake: number
  toReturn: number
}
export interface SinglesPricing {
  tickets: SingleTicket[]
  totalStake: number
  maxReturn: number
}

/** Price every selection as its own single at `stakeEach`. */
export function priceSingles(slip: BetSlip, stakeEach: number): SinglesPricing {
  requireStake(stakeEach)
  const tickets = slip.selections.map((s) => ({
    label: s.label,
    decimal: s.decimal,
    stake: stakeEach,
    toReturn: Math.round(stakeEach * s.decimal),
  }))
  return {
    tickets,
    totalStake: tickets.length * stakeEach,
    maxReturn: tickets.reduce((a, t) => a + t.toReturn, 0),
  }
}

export interface ParlayPricing {
  legs: string[]
  decimal: number
  stake: number
  toReturn: number
}

/** Price the whole slip as one parlay (every leg must win). */
export function priceParlay(slip: BetSlip, stake: number): ParlayPricing {
  requireStake(stake)
  if (slip.selections.length < 2) throw new Error('a parlay needs ≥2 selections')
  if (!canCombine(slip)) throw new Error('cannot parlay related legs from the same event')
  const decimal = parlayDecimalOf(slip.selections.map((s) => s.decimal))
  return {
    legs: slip.selections.map((s) => s.label),
    decimal,
    stake,
    toReturn: Math.round(stake * decimal),
  }
}

/** Price the slip as a round robin across the given combination sizes. */
export function priceRoundRobin(slip: BetSlip, sizes: number[], stakePerParlay: number): RoundRobinTicket {
  if (!canCombine(slip)) throw new Error('cannot round-robin related legs from the same event')
  return roundRobin(
    slip.selections.map((s) => ({ label: s.label, decimal: s.decimal })),
    sizes,
    stakePerParlay,
  )
}

export interface TeaserPricing {
  legs: { label: string; originalLine: number; teasedLine: number }[]
  points: number
  decimal: number
  stake: number
  toReturn: number
}

/** Price the slip as a teaser at `points`, previewing each teased line. */
export function priceTeaser(slip: BetSlip, points: number, stake: number): TeaserPricing {
  requireStake(stake)
  if (!teaserEligible(slip)) throw new Error('all legs must be spreads/totals of the same sport to tease')
  if (!canCombine(slip)) throw new Error('cannot tease related legs from the same event')
  const sport = slip.selections[0].sport as TeaserSport
  const decimal = teaserDecimal(sport, points, slip.selections.length)
  const legs = slip.selections.map((s) => {
    const line = s.line ?? 0
    return {
      label: s.label,
      originalLine: line,
      teasedLine: teaseLine(s.market as 'spread' | 'total', s.pick as SlipPick, line, points),
    }
  })
  return { legs, points, decimal, stake, toReturn: Math.round(stake * decimal) }
}

function requireStake(stake: number): void {
  if (!Number.isInteger(stake) || stake < 1) throw new Error(`stake must be a positive integer, got ${stake}`)
}
