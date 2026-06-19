/**
 * The bet slip model — pure, framework-agnostic. A leg captures a selection at the
 * `priceDisplay` it was added at (bet acceptance locks the price, CLAUDE.md §4); the
 * slip prices singles or a parlay off those locked decimals, flags same-game parlays,
 * and detects when a leg's price has moved since it was added (re-confirm).
 *
 * Credit/balance only — all amounts are integer cents settled through `core`.
 */

import type {
  NormalizedEvent,
  NormalizedMarket,
  Price,
  Selection,
} from '../../lib/odds/contract.js'
import { correlationForSport, devig, impliedProbability, priceSgp } from '../../lib/odds/pricing.js'
import { parlayDecimal, profitCents, toReturnCents } from './odds-format.js'

export type SlipMode = 'single' | 'parlay'

/** One leg on the slip — a selection with its event/market context and locked price. */
export interface SlipLeg {
  /** Unique within a slip — the selection id. */
  key: string
  eventId: string
  eventLabel: string
  leagueId: string
  marketId: string
  marketType: NormalizedMarket['type']
  marketPeriod: NormalizedMarket['period']
  statId?: string
  playerId?: string
  side: string
  line?: number
  /** Human label shown on the slip, e.g. "Lakers −3.5", "Over 224.5", "L. James o27.5 PTS". */
  pick: string
  /** The `priceDisplay` LOCKED when the leg was added. */
  price: Price
  /** SGO sportID of the event (e.g. 'BASKETBALL') — picks the SGP correlation factor. */
  sport?: string
  /** The leg's de-vigged TRUE win probability, locked at add time from its market's raw
   *  prices. Same-game parlay pricing combines these with correlation (see priceSgp). */
  trueProb?: number
}

const STAT_LABEL: Record<string, string> = {
  points: 'PTS',
  rebounds: 'REB',
  assists: 'AST',
  passing_yards: 'Pass Yds',
  rushing_yards: 'Rush Yds',
  goals: 'Goals',
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

/** The human label for a selection in the context of its event + market. */
export function pickLabel(event: NormalizedEvent, market: NormalizedMarket, s: Selection): string {
  switch (market.type) {
    case 'moneyline':
      return s.side === 'home' ? event.home : event.away
    case 'spread':
      return `${s.side === 'home' ? event.home : event.away} ${signed(s.line ?? 0)}`
    case 'total':
      return `${s.side === 'over' ? 'Over' : 'Under'} ${s.line}`
    case 'prop': {
      const stat = market.statId ? (STAT_LABEL[market.statId] ?? market.statId) : ''
      const ou = s.side === 'over' ? 'o' : 'u'
      return `${market.playerId ?? ''} ${ou}${s.line} ${stat}`.trim()
    }
  }
}

/**
 * The leg's TRUE (de-vigged) win probability, taken from its market's RAW prices. We
 * de-vig only across the coherent opposing pair at the SAME line (so an alt-line market
 * that bundles several lines isn't normalized as one big market); for moneyline (no
 * line) that's the two sides. Falls back to the lone implied prob if there's no pair.
 */
function trueProbForLeg(market: NormalizedMarket, s: Selection): number {
  const line = s.line ?? null
  const pool = market.selections.filter((x) => (x.line ?? null) === line)
  const group = pool.length >= 1 ? pool : market.selections
  const idx = group.findIndex((x) => x.selectionId === s.selectionId)
  if (idx < 0) return impliedProbability(s.priceRaw.american)
  return devig(group.map((x) => x.priceRaw.american))[idx]
}

/** Build a slip leg from a selection in its event/market. Locks `priceDisplay`, and
 *  locks the de-vigged true probability + sport for same-game-parlay pricing. */
export function legFromSelection(
  event: NormalizedEvent,
  market: NormalizedMarket,
  s: Selection,
): SlipLeg {
  return {
    key: s.selectionId,
    eventId: event.eventId,
    eventLabel: `${event.away} @ ${event.home}`,
    leagueId: event.leagueId,
    marketId: market.marketId,
    marketType: market.type,
    marketPeriod: market.period,
    ...(market.statId ? { statId: market.statId } : {}),
    ...(market.playerId ? { playerId: market.playerId } : {}),
    side: s.side,
    ...(s.line === undefined ? {} : { line: s.line }),
    pick: pickLabel(event, market, s),
    price: { ...s.priceDisplay },
    sport: event.sport,
    trueProb: trueProbForLeg(market, s),
  }
}

/** Whether every leg is on the SAME event — a same-game parlay, priced with correlation
 *  via `sgpPrice`/`combinedDecimal` (see lib/odds/pricing.priceSgp). With <2 legs there is
 *  no parlay, so it's not an SGP. */
export function isSameGame(legs: SlipLeg[]): boolean {
  if (legs.length < 2) return false
  return legs.every((l) => l.eventId === legs[0].eventId)
}

/** The INDEPENDENT combined parlay price (product of leg decimals, capped) — correct for
 *  a cross-game parlay where the legs really are independent. */
export function parlayPrice(legs: SlipLeg[]): number {
  return parlayDecimal(legs.map((l) => l.price.decimal))
}

/** A leg's lean on a comparable AXIS. Two legs only carry a real opposing relationship when they
 *  share an axis: the SCORING axis (over = +1 high, under = −1 low) or the TEAM axis (home = +1,
 *  away = −1). A leg sits on at most one axis; `legDirection` returns its scoring lean (the axis
 *  that drives a negative-correlation total pair) or 0. */
const SCORING_DIR: Readonly<Record<string, number>> = { over: 1, under: -1 }
const TEAM_DIR: Readonly<Record<string, number>> = { home: 1, away: -1 }
export function legDirection(leg: SlipLeg): number {
  return SCORING_DIR[leg.side] ?? 0
}

/**
 * The correlation sign for a pair of same-game legs. A NEGATIVE sign (which prices the parlay
 * LONGER than independent) is only assigned when the two legs sit on the SAME axis and oppose —
 * a 1st-half UNDER with a full-game OVER (both scoring), or two opposite team sides. Legs on
 * DIFFERENT axes (e.g. an away moneyline + an over total) have no reliable opposing relationship,
 * so they default to +1 (the house-safe, shortening side) rather than a spurious negative that
 * would overpay the player.
 */
function pairCorrelationSign(a: SlipLeg, b: SlipLeg): number {
  const sa = SCORING_DIR[a.side]
  const sb = SCORING_DIR[b.side]
  if (sa !== undefined && sb !== undefined) return sa === sb ? 1 : -1
  const ta = TEAM_DIR[a.side]
  const tb = TEAM_DIR[b.side]
  if (ta !== undefined && tb !== undefined) return ta === tb ? 1 : -1
  return 1 // cross-axis (or no clean axis): default to positive (shorten), never spuriously long
}

/** The SIGNED correlation for a same-game leg set: the sport's magnitude, signed by the net
 *  pairwise axis agreement. All-aligned → +magnitude (price shorter); net-opposing on a shared
 *  axis → −magnitude (price longer). */
export function effectiveSgpCorrelation(legs: SlipLeg[]): number {
  const mag = correlationForSport(legs[0]?.sport)
  let sum = 0
  let pairs = 0
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      sum += pairCorrelationSign(legs[i], legs[j])
      pairs += 1
    }
  }
  return pairs === 0 ? mag : (sum / pairs) * mag
}

/** The correlated SAME-GAME-parlay price: combine the legs' locked true probabilities with
 *  the SIGNED same-game correlation, re-apply the house margin, cap at the 299-to-1 ceiling.
 *  Same-direction legs (ρ ≥ 0) are also capped at the naive independent product (correlation
 *  only shortens); opposing-direction legs (ρ < 0) skip that cap so the negatively-correlated
 *  parlay prices LONGER than independent. See lib/odds/pricing.priceSgp. */
export function sgpPrice(legs: SlipLeg[]): number {
  if (legs.length < 2) return legs[0]?.price.decimal ?? 1
  const trueProbs = legs.map((l) => l.trueProb ?? impliedProbability(l.price.american))
  const rho = effectiveSgpCorrelation(legs)
  const independentDisplayDecimal = parlayDecimal(legs.map((l) => l.price.decimal))
  return priceSgp(trueProbs, {
    rho,
    ...(rho >= 0 ? { independentDisplayDecimal } : {}),
  }).decimal
}

/** The combined price for a parlay slip: a correlated SGP price when every leg is on the
 *  SAME game, otherwise the independent product. `sgp` flags which path was taken. */
export function combinedDecimal(legs: SlipLeg[]): { decimal: number; sgp: boolean } {
  if (isSameGame(legs)) return { decimal: sgpPrice(legs), sgp: true }
  return { decimal: parlayPrice(legs), sgp: false }
}

export interface SlipQuote {
  /** Stake actually at risk across the slip (per-leg × N for singles, the one stake for a parlay). */
  totalStakeCents: number
  /** Total returned if everything wins (stake + profit). */
  toReturnCents: number
  /** Profit if everything wins. */
  profitCents: number
  /** The parlay decimal (parlay mode) or the lone leg's decimal (single leg). */
  decimal: number
}

/**
 * Price the slip. In `single` mode `stakeCents` is the per-leg stake and each leg
 * stands alone (total stake = stake × legs). In `parlay` mode `stakeCents` is the
 * one combined stake on the parlay price. With a single leg both modes agree.
 */
export function slipQuote(legs: SlipLeg[], mode: SlipMode, stakeCents: number): SlipQuote {
  if (legs.length === 0 || stakeCents <= 0) {
    return { totalStakeCents: 0, toReturnCents: 0, profitCents: 0, decimal: 1 }
  }
  if (mode === 'parlay' && legs.length >= 2) {
    const { decimal } = combinedDecimal(legs)
    return {
      totalStakeCents: stakeCents,
      toReturnCents: toReturnCents(stakeCents, decimal),
      profitCents: profitCents(stakeCents, decimal),
      decimal,
    }
  }
  // singles: each leg its own stake
  let ret = 0
  for (const l of legs) ret += toReturnCents(stakeCents, l.price.decimal)
  const totalStake = stakeCents * legs.length
  return {
    totalStakeCents: totalStake,
    toReturnCents: ret,
    profitCents: ret - totalStake,
    decimal: legs.length === 1 ? legs[0].price.decimal : 1,
  }
}

/** Two legs of the SAME market on the SAME event can't be combined in a parlay
 *  (a related contingency / mutually-exclusive pair). Returns the conflicting keys. */
export function relatedConflicts(legs: SlipLeg[]): string[] {
  const seen = new Map<string, string>()
  const bad: string[] = []
  for (const l of legs) {
    const k = `${l.eventId}:${l.marketId}`
    if (seen.has(k)) bad.push(l.key, seen.get(k)!)
    else seen.set(k, l.key)
  }
  return [...new Set(bad)]
}

/** Sides that directly oppose each other and so can't share a parlay/SGP. */
const OPPOSITE_SIDE: Readonly<Record<string, string>> = {
  over: 'under',
  under: 'over',
  home: 'away',
  away: 'home',
  yes: 'no',
  no: 'yes',
}

/**
 * CONTRADICTORY legs in a slip: opposing sides of the same stat FAMILY on one event —
 * a player's Over AND Under on the same prop (even across a main + an alternate line),
 * both teams' moneyline, both sides of the same spread/total. These are mutually
 * exclusive / negatively correlated and must never be combined (you'd be guaranteed a
 * loser). Broader than `relatedConflicts`, which only catches the identical market.
 * Returns the conflicting keys.
 */
export function contradictoryLegs(legs: SlipLeg[]): string[] {
  const bad = new Set<string>()
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i]
      const b = legs[j]
      if (a.eventId !== b.eventId) continue
      const sameFamily =
        a.marketType === b.marketType &&
        a.marketPeriod === b.marketPeriod &&
        (a.statId ?? '') === (b.statId ?? '') &&
        (a.playerId ?? '') === (b.playerId ?? '')
      if (sameFamily && OPPOSITE_SIDE[a.side] === b.side) {
        bad.add(a.key)
        bad.add(b.key)
      }
    }
  }
  return [...bad]
}

/** Legs whose live `priceDisplay` has moved since they were added — the slip must
 *  re-confirm before placing (CLAUDE.md §4 bet acceptance). */
export function movedLegKeys(legs: SlipLeg[], events: NormalizedEvent[]): string[] {
  const moved: string[] = []
  for (const l of legs) {
    const ev = events.find((e) => e.eventId === l.eventId)
    const m = ev?.markets.find((mk) => mk.marketId === l.marketId)
    const s = m?.selections.find((x) => x.selectionId === l.key)
    if (s && s.priceDisplay.american !== l.price.american) moved.push(l.key)
  }
  return moved
}
