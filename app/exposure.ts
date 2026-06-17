/**
 * Live exposure by game (CLAUDE.md §4) — the book's at-risk OPEN stake, broken down by
 * the product each bet was placed on. The durable ledger records RESOLVED bets; this
 * tracks the bets still in flight. It rides core's place/resolve events (added with the
 * Phase-2 per-game attribution work): on `onWagerPlaced` it adds the stake to the game
 * that's on screen, on `onWagerResolved` it removes it from the game the bet was PLACED
 * on (so an async sportsbook grade decrements the right game, not whatever's active).
 *
 * In-memory + live (open holds are session state — book-store clears pending on reload),
 * so this starts empty each load and accumulates as bets are placed. Same subscribe +
 * version-snapshot shape as the other stores. Holds no money.
 */

import { onWagerPlaced, onWagerResolved, type PlaceEvent, type ResolveEvent } from '../core/index.js'
import { getActiveGame } from './ledger-store.js'
import { getBets, openBets, type BookBet } from './book/bets-store.js'
import { toReturnCents } from './book/odds-format.js'
import type { SlipLeg } from './book/slip.js'
import { correlationForSport, impliedProbability } from '../lib/odds/pricing.js'
import { downline, membersByRole, type Org } from '../org/index.js'

export interface ExposureByGame {
  key: string
  name: string
  /** Open (ungraded) stake on this game, in cents. */
  open: number
}

interface Held {
  game: { key: string; name: string }
  stake: number
}

const held = new Map<string, Held>() // wagerId → its open stake + the game it was placed on
const byGame = new Map<string, ExposureByGame>()
const listeners = new Set<() => void>()
let version = 0
let snapshot: ExposureByGame[] = []

function rebuild(): void {
  snapshot = [...byGame.values()].filter((g) => g.open > 0).sort((a, b) => b.open - a.open)
  version += 1
  listeners.forEach((l) => l())
}

onWagerPlaced((e: PlaceEvent) => {
  const game = getActiveGame()
  held.set(e.wagerId, { game, stake: e.stake })
  const g = byGame.get(game.key) ?? { key: game.key, name: game.name, open: 0 }
  g.open += e.stake
  byGame.set(game.key, g)
  rebuild()
})

onWagerResolved((e: ResolveEvent) => {
  const rec = held.get(e.wagerId)
  if (!rec) return // a bet placed before this tracker existed — nothing to decrement
  held.delete(e.wagerId)
  const g = byGame.get(rec.game.key)
  if (g) g.open = Math.max(0, g.open - rec.stake)
  rebuild()
})

/** Open exposure per game, biggest first (stable reference between changes). */
export function getExposureByGame(): ExposureByGame[] {
  return snapshot
}

export function subscribeExposure(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getExposureVersion(): number {
  return version
}

/** Total open stake across every game (cents). */
export function totalOpenExposure(): number {
  let total = 0
  for (const g of byGame.values()) total += g.open
  return total
}

/* ===========================================================================
 * CONSOLIDATED SPORTSBOOK EXPOSURE (CLAUDE.md §4) — real liability across singles,
 * parlays, SGPs and cash-out positions, by market / event / player / selection /
 * bet-type, aggregated up the agent tree. Pure functions over the bets store
 * (app/book/bets-store) + the org; READ-ONLY (moves no money). The book's downside on
 * an OPEN bet is what it PAYS if the bet wins — the player's profit — so liability is
 * measured in potential payout, not open-bet count.
 * ===========================================================================*/

/** The book's worst-case payout if this OPEN bet wins (the player's profit, in cents).
 *  A settled/cashed bet carries no open liability. A partially-cashed bet keeps riding on
 *  its reduced `stakeCents`, so its remaining liability falls out of the same formula. */
export function betLiability(bet: BookBet): number {
  if (bet.status !== 'open') return 0
  return Math.max(0, toReturnCents(bet.stakeCents, bet.decimal) - bet.stakeCents)
}

/** A bet's risk class: a straight, a cross-game parlay, or a same-game parlay (SGP). */
export function betType(bet: BookBet): 'single' | 'parlay' | 'sgp' {
  if (bet.mode !== 'parlay' || bet.legs.length < 2) return 'single'
  return bet.legs.every((l) => l.eventId === bet.legs[0].eventId) ? 'sgp' : 'parlay'
}

/** One row of a consolidated-exposure breakdown. */
export interface ExposureRow {
  key: string
  label: string
  /** Worst-case payout the book is on the hook for under this key, in cents. */
  liabilityCents: number
  /** Open stake riding under this key (turnover at risk), in cents. */
  stakeCents: number
  betCount: number
}

export interface ConsolidatedExposure {
  totalLiabilityCents: number
  totalStakeCents: number
  openBetCount: number
  byEvent: ExposureRow[]
  byMarket: ExposureRow[]
  bySport: ExposureRow[]
  byPlayer: ExposureRow[]
  bySelection: ExposureRow[]
  byBetType: ExposureRow[]
}

/** The open sportsbook bets driving live liability (newest-first, status 'open'). */
export function openBookBets(bets: BookBet[] = getBets()): BookBet[] {
  return openBets(bets)
}

/** A stable selection key for one leg (event + market + side + line). */
function selectionKey(leg: SlipLeg): string {
  return `${leg.eventId}|${leg.marketId}|${leg.side}|${leg.line ?? ''}`
}

/** Aggregate liability/stake/count into rows keyed by `keyFn`, biggest liability first.
 *  `keyFn` returns one or MANY keys for a bet (a parlay touches several events/markets);
 *  the bet's FULL liability is attributed to each key it touches (worst-case per key). */
function aggregate(
  bets: BookBet[],
  keyFn: (bet: BookBet) => Array<{ key: string; label: string }>,
): ExposureRow[] {
  const rows = new Map<string, ExposureRow>()
  for (const bet of bets) {
    const liability = betLiability(bet)
    const seen = new Set<string>()
    for (const { key, label } of keyFn(bet)) {
      if (seen.has(key)) continue // count a bet once per key even if two legs share it
      seen.add(key)
      const row = rows.get(key) ?? { key, label, liabilityCents: 0, stakeCents: 0, betCount: 0 }
      row.liabilityCents += liability
      row.stakeCents += bet.stakeCents
      row.betCount += 1
      rows.set(key, row)
    }
  }
  return [...rows.values()].sort((a, b) => b.liabilityCents - a.liabilityCents)
}

const distinct = <T,>(legs: SlipLeg[], pick: (l: SlipLeg) => T): T[] => [...new Set(legs.map(pick))]

/**
 * Consolidate open-bet liability across every dimension at once. Each breakdown
 * attributes a bet's full payout to each key it touches (a 3-leg parlay is "on the hook"
 * for its whole payout on each of its 3 events/markets), so a per-key total is the
 * worst-case the book pays if that key's bets all land. The top-line totals count each
 * bet once.
 */
export function consolidatedExposure(bets: BookBet[] = openBookBets()): ConsolidatedExposure {
  const open = bets.filter((b) => b.status === 'open')
  let totalLiabilityCents = 0
  let totalStakeCents = 0
  for (const b of open) {
    totalLiabilityCents += betLiability(b)
    totalStakeCents += b.stakeCents
  }
  const TYPE_LABEL = { single: 'Singles', parlay: 'Parlays', sgp: 'Same-game parlays' } as const
  return {
    totalLiabilityCents,
    totalStakeCents,
    openBetCount: open.length,
    byEvent: aggregate(open, (b) =>
      distinct(b.legs, (l) => l.eventId).map((id) => ({
        key: id,
        label: b.legs.find((l) => l.eventId === id)!.eventLabel,
      })),
    ),
    byMarket: aggregate(open, (b) =>
      distinct(b.legs, (l) => l.marketType).map((t) => ({ key: t, label: marketLabel(t) })),
    ),
    bySport: aggregate(open, (b) =>
      distinct(b.legs, (l) => l.leagueId).map((lg) => ({ key: lg, label: lg })),
    ),
    byPlayer: aggregate(open, (b) => [{ key: b.accountId, label: b.playerName }]),
    bySelection: aggregate(open, (b) => b.legs.map((l) => ({ key: selectionKey(l), label: l.pick }))),
    byBetType: aggregate(open, (b) => [{ key: betType(b), label: TYPE_LABEL[betType(b)] }]),
  }
}

function marketLabel(type: SlipLeg['marketType']): string {
  return { moneyline: 'Moneyline', spread: 'Spread', total: 'Total', prop: 'Player props' }[type] ?? type
}

/** Liability rolled UP the agent tree: one row per agent/sub-agent/manager = the worst-case
 *  payout across every open bet in their downline. (A player's bets count for each ancestor.) */
export function exposureByAgent(org: Org, bets: BookBet[] = openBookBets()): ExposureRow[] {
  const open = bets.filter((b) => b.status === 'open')
  const staff = [
    ...membersByRole(org, 'manager'),
    ...membersByRole(org, 'subagent'),
    ...membersByRole(org, 'agent'),
  ]
  const rows: ExposureRow[] = []
  for (const m of staff) {
    const scope = new Set(downline(org, m.id).map((d) => d.id))
    let liabilityCents = 0
    let stakeCents = 0
    let betCount = 0
    for (const b of open) {
      if (!scope.has(b.accountId)) continue
      liabilityCents += betLiability(b)
      stakeCents += b.stakeCents
      betCount += 1
    }
    if (betCount > 0) rows.push({ key: m.id, label: m.name, liabilityCents, stakeCents, betCount })
  }
  return rows.sort((a, b) => b.liabilityCents - a.liabilityCents)
}

/* ===========================================================================
 * CORRELATED DOWNSIDE — parlay/SGP legs move TOGETHER, so the book's real worst case
 * is the correlated outcome (a "chalk day" where every favourite/over lands), not the
 * expected hold. A bet wins on a chalk day iff every leg is the favourite/over side; an
 * entirely-chalk parlay then pays its full (large) price. We read each leg's locked
 * de-vigged true probability (favourite/over ⇔ trueProb ≥ 0.5) and consume C's SGP
 * correlation model (correlationForSport) to annotate how tightly an SGP's legs co-move.
 * ===========================================================================*/

/** Is this leg the favourite / over — the side that lands on a chalk day? Uses the leg's
 *  locked de-vigged true win prob (falls back to the price's implied prob). */
export function isChalkLeg(leg: SlipLeg): boolean {
  const p = leg.trueProb ?? impliedProbability(leg.price.american)
  return p >= 0.5
}

/** Does this bet WIN on a chalk day? Only if every leg is the favourite/over. */
export function winsUnderChalk(bet: BookBet): boolean {
  return bet.legs.length > 0 && bet.legs.every(isChalkLeg)
}

/** An SGP risk cluster — same-game legs that move together, with the sport's correlation. */
export interface SgpCluster {
  eventId: string
  label: string
  liabilityCents: number
  /** Positive-correlation factor for the sport (C's model) — higher ⇒ legs co-move more. */
  rho: number
  betCount: number
}

export interface CorrelatedDownside {
  /** Worst-case payout if every favourite/over lands today (the chalk-day liability). */
  chalkLiabilityCents: number
  chalkBetCount: number
  /** Chalk-day liability per event (which game hurts most if it goes chalk). */
  byEvent: ExposureRow[]
  /** The single event with the largest chalk-day liability (0 when none). */
  worstEvent: ExposureRow | null
  /** Same-game-parlay clusters, with correlation — the tightest co-moving positions. */
  sgpClusters: SgpCluster[]
}

/**
 * Model the worst-case correlated downside over open bets. The headline `chalkLiability`
 * is the total the book pays if every favourite/over lands (entirely-chalk bets all win
 * together) — the correlated tail the expected hold hides. SGP clusters surface the
 * within-game correlation (rho) that makes a same-game parlay riskier than its price alone.
 */
export function correlatedDownside(bets: BookBet[] = openBookBets()): CorrelatedDownside {
  const open = bets.filter((b) => b.status === 'open')
  const chalk = open.filter(winsUnderChalk)
  const chalkLiabilityCents = chalk.reduce((s, b) => s + betLiability(b), 0)

  const byEvent = aggregate(chalk, (b) =>
    distinct(b.legs, (l) => l.eventId).map((id) => ({
      key: id,
      label: b.legs.find((l) => l.eventId === id)!.eventLabel,
    })),
  )

  const clusters = new Map<string, SgpCluster>()
  for (const b of open) {
    if (betType(b) !== 'sgp') continue
    const leg0 = b.legs[0]
    const c = clusters.get(leg0.eventId) ?? {
      eventId: leg0.eventId,
      label: leg0.eventLabel,
      liabilityCents: 0,
      rho: correlationForSport(leg0.sport),
      betCount: 0,
    }
    c.liabilityCents += betLiability(b)
    c.betCount += 1
    clusters.set(leg0.eventId, c)
  }

  return {
    chalkLiabilityCents,
    chalkBetCount: chalk.length,
    byEvent,
    worstEvent: byEvent[0] ?? null,
    sgpClusters: [...clusters.values()].sort((a, b) => b.liabilityCents - a.liabilityCents),
  }
}
