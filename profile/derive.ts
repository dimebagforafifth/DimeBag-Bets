/**
 * Pure derivations for the Profile v2 projection — units, the cumulative-P&L curve, and split
 * groupings. Every function is a pure read over settled rows / settled bets: no money moves, no
 * store is touched. Kept separate from the adapter so they're trivially unit-testable and the
 * numbers reconcile to the ledger by construction (they're computed from the same rows the
 * verified record is).
 */

import type { BetRow } from '../app/ledger-stats.js'
import type { BookBet } from '../app/book/bets-store.js'
import type { ProfileSplit, PnlPoint } from './projection.js'

/** Decided = a real win or loss; push/void are no-action and never count toward rate/units. */
function isDecided(outcome: string): boolean {
  return outcome === 'win' || outcome === 'loss'
}

/**
 * Units won — Σ over decided rows of (profit / stake). Stake-size-independent: a win at decimal
 * d contributes d−1, a loss −1. Zero-stake rows are skipped (can't form a unit). Reconciles to
 * the ledger because it's derived from the same settled rows as the net.
 */
export function unitsFromRows(rows: readonly BetRow[]): number {
  let units = 0
  for (const r of rows) {
    if (!isDecided(r.outcome) || r.stake <= 0) continue
    units += r.profit / r.stake
  }
  return units
}

/**
 * The cumulative-P&L curve: running Σ profit over the rows in time order (oldest → newest). The
 * final point's `cumulative` equals Σ profit over every row — i.e. the lifetime net — so the
 * graph reconciles to the headline figure. Push/void rows carry profit 0, so they extend the
 * line in time without moving it.
 */
export function pnlFromRows(rows: readonly BetRow[]): PnlPoint[] {
  const ordered = [...rows].sort((a, b) => a.time - b.time || a.id - b.id)
  const out: PnlPoint[] = []
  let cumulative = 0
  for (const r of ordered) {
    cumulative += r.profit
    out.push({ time: r.time, cumulative })
  }
  return out
}

/** Group settled rows by game into split rows (most-wagered first). */
export function gameSplits(rows: readonly BetRow[]): ProfileSplit[] {
  const map = new Map<
    string,
    { label: string; bets: number; wagered: number; net: number; wins: number; decided: number }
  >()
  for (const r of rows) {
    const g = map.get(r.gameKey) ?? {
      label: r.game,
      bets: 0,
      wagered: 0,
      net: 0,
      wins: 0,
      decided: 0,
    }
    g.bets += 1
    g.wagered += r.stake
    g.net += r.profit
    if (isDecided(r.outcome)) {
      g.decided += 1
      if (r.profit > 0) g.wins += 1
    }
    map.set(r.gameKey, g)
  }
  return finalize([...map.entries()].map(([key, g]) => ({ key, ...g })))
}

/** A settled book bet's signed profit (return − stake); 0 while open. */
function betProfit(b: BookBet): number {
  return (b.returnCents ?? 0) - b.stakeCents
}

/** A settled bet is decided if it won, lost, or was cashed out (push/void are no-action). */
function betDecided(b: BookBet): boolean {
  return b.status === 'won' || b.status === 'lost' || b.status === 'cashed'
}

const SPORT_LABEL: Record<string, string> = {
  BASKETBALL: 'Basketball',
  FOOTBALL: 'Football',
  BASEBALL: 'Baseball',
  HOCKEY: 'Hockey',
  SOCCER: 'Soccer',
  MMA: 'MMA',
  BOXING: 'Boxing',
  TENNIS: 'Tennis',
}
const MARKET_LABEL: Record<string, string> = {
  moneyline: 'Moneyline',
  spread: 'Spread',
  total: 'Total',
  prop: 'Player prop',
  parlay: 'Parlay',
}

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s
}

/** The sport a settled bet belongs to: its single sport, or `PARLAY`/`OTHER` for mixed slips. */
function sportKeyOf(b: BookBet): { key: string; label: string } {
  const sports = [...new Set(b.legs.map((l) => l.sport).filter((s): s is string => !!s))]
  if (sports.length === 1)
    return { key: sports[0], label: SPORT_LABEL[sports[0]] ?? titleCase(sports[0]) }
  if (b.mode === 'parlay' || sports.length > 1) return { key: 'PARLAY', label: 'Parlay' }
  return { key: 'OTHER', label: 'Other' }
}

/** The market a settled bet belongs to: its leg's market type, or `parlay` for a multi. */
function marketKeyOf(b: BookBet): { key: string; label: string } {
  if (b.mode === 'parlay') return { key: 'parlay', label: 'Parlay' }
  const t = b.legs[0]?.marketType ?? 'other'
  return { key: t, label: MARKET_LABEL[t] ?? titleCase(t) }
}

/** Group settled book bets by sport (single-sport slips; mixed → Parlay). Where data exists. */
export function sportSplits(bets: readonly BookBet[]): ProfileSplit[] {
  return betSplits(bets, sportKeyOf)
}

/** Group settled book bets by market type (single legs; multi → Parlay). Where data exists. */
export function marketSplits(bets: readonly BookBet[]): ProfileSplit[] {
  return betSplits(bets, marketKeyOf)
}

function betSplits(
  bets: readonly BookBet[],
  keyer: (b: BookBet) => { key: string; label: string },
): ProfileSplit[] {
  const map = new Map<
    string,
    { label: string; bets: number; wagered: number; net: number; wins: number; decided: number }
  >()
  for (const b of bets) {
    const { key, label } = keyer(b)
    const g = map.get(key) ?? { label, bets: 0, wagered: 0, net: 0, wins: 0, decided: 0 }
    g.bets += 1
    g.wagered += b.stakeCents
    g.net += betProfit(b)
    if (betDecided(b)) {
      g.decided += 1
      if (betProfit(b) > 0) g.wins += 1
    }
    map.set(key, g)
  }
  return finalize([...map.entries()].map(([key, g]) => ({ key, ...g })))
}

/** Compute roi/winRate and sort most-wagered first. */
function finalize(
  groups: {
    key: string
    label: string
    bets: number
    wagered: number
    net: number
    wins: number
    decided: number
  }[],
): ProfileSplit[] {
  return groups
    .map((g) => ({
      key: g.key,
      label: g.label,
      bets: g.bets,
      wagered: g.wagered,
      net: g.net,
      roi: g.wagered ? g.net / g.wagered : 0,
      winRate: g.decided ? Math.round((g.wins / g.decided) * 100) : 0,
    }))
    .sort((a, b) => b.wagered - a.wagered)
}
