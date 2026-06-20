/**
 * Public betting splits — PURE projection (no state, no money, no I/O).
 *
 * From a set of recorded bets it derives, per market, the bets%-vs-handle% on each side.
 * It reads the recorded bets and computes shares; it never touches an account or a credit.
 *
 * Attribution: each LEG of a bet contributes ONE ticket and the bet's stake to its market.
 * A single is one leg (its stake); a parlay rides its whole stake on each leg's market —
 * the standard "money exposed to this side". Because a split only ever compares sides WITHIN
 * one market, a parlay touching several markets is consistent inside each of them.
 *
 * RECONCILIATION (the cardinal rule made checkable): `reconcile` returns Σ legs and Σ
 * stake-per-leg over the inputs; the sum of every market's totalTickets / totalHandleCents
 * equals those. A projection that ever invented handle would fail it (see splits.test.ts).
 */

import type { BookBet } from '../app/book/bets-store.js'
import type {
  MarketSplit,
  RankBy,
  RankedMarket,
  SideSplit,
  SplitBet,
  SplitReconciliation,
} from './types.js'

/** Expand recorded bets into per-leg split rows (one row per leg). Void/cancelled bets carry
 *  no betting interest and should be filtered by the caller before this. Pure. */
export function toSplitBets(bets: BookBet[]): SplitBet[] {
  const out: SplitBet[] = []
  for (const b of bets) {
    for (const leg of b.legs) {
      out.push({
        betId: b.id,
        accountId: b.accountId,
        marketId: leg.marketId,
        marketType: leg.marketType,
        side: leg.side,
        pick: leg.pick,
        eventId: leg.eventId,
        eventLabel: leg.eventLabel,
        leagueId: leg.leagueId,
        ...(leg.sport === undefined ? {} : { sport: leg.sport }),
        stakeCents: b.stakeCents,
      })
    }
  }
  return out
}

const pctOf = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0)

/** The bets%-vs-handle% split for ONE market's rows (all rows must share a marketId).
 *  Returns null for an empty set. */
export function splitOfMarket(rows: SplitBet[]): MarketSplit | null {
  if (rows.length === 0) return null
  const first = rows[0]
  const bySide = new Map<string, { pick: string; tickets: number; handleCents: number }>()
  let totalHandleCents = 0
  for (const r of rows) {
    const s = bySide.get(r.side) ?? { pick: r.pick, tickets: 0, handleCents: 0 }
    s.tickets += 1
    s.handleCents += r.stakeCents
    bySide.set(r.side, s)
    totalHandleCents += r.stakeCents
  }
  const totalTickets = rows.length
  const sides: SideSplit[] = [...bySide.entries()]
    .map(([side, v]) => ({
      side,
      pick: v.pick,
      tickets: v.tickets,
      handleCents: v.handleCents,
      ticketPct: pctOf(v.tickets, totalTickets),
      handlePct: pctOf(v.handleCents, totalHandleCents),
    }))
    .sort(
      (a, b) =>
        b.handleCents - a.handleCents || b.tickets - a.tickets || a.side.localeCompare(b.side),
    )
  return {
    marketId: first.marketId,
    marketType: first.marketType,
    eventId: first.eventId,
    eventLabel: first.eventLabel,
    leagueId: first.leagueId,
    ...(first.sport === undefined ? {} : { sport: first.sport }),
    totalTickets,
    totalHandleCents,
    sides,
  }
}

/** Group rows by market and split each — keyed by marketId. */
export function marketSplits(rows: SplitBet[]): Map<string, MarketSplit> {
  const byMarket = new Map<string, SplitBet[]>()
  for (const r of rows) {
    const list = byMarket.get(r.marketId)
    if (list) list.push(r)
    else byMarket.set(r.marketId, [r])
  }
  const out = new Map<string, MarketSplit>()
  for (const [marketId, list] of byMarket) {
    const split = splitOfMarket(list)
    if (split) out.set(marketId, split)
  }
  return out
}

/** The split for one market id over a row set (the inline-bar lookup), or null if no action. */
export function splitForMarket(rows: SplitBet[], marketId: string): MarketSplit | null {
  return splitOfMarket(rows.filter((r) => r.marketId === marketId))
}

/** The most-bet markets, ranked by ticket count or handle. Deterministic tie-break:
 *  the chosen metric, then handle, then marketId. */
export function mostBetMarkets(
  rows: SplitBet[],
  opts: { by?: RankBy; limit?: number } = {},
): RankedMarket[] {
  const by = opts.by ?? 'tickets'
  const value = (m: MarketSplit): number => (by === 'tickets' ? m.totalTickets : m.totalHandleCents)
  const splits = [...marketSplits(rows).values()].sort(
    (a, b) =>
      value(b) - value(a) ||
      b.totalHandleCents - a.totalHandleCents ||
      a.marketId.localeCompare(b.marketId),
  )
  const limited = opts.limit != null ? splits.slice(0, opts.limit) : splits
  return limited.map((split, i) => ({ rank: i + 1, split, lean: split.sides[0] ?? null }))
}

/** Prove the projection invents nothing: the totals it attributes equal its recorded inputs
 *  (Σ legs, Σ stake-per-leg). Each row is a placed-bet leg — the bet-store and the `core` hold
 *  are written together at placement — so the split adds nothing to the action actually placed. */
export function reconcile(rows: SplitBet[]): SplitReconciliation {
  let handleCents = 0
  for (const r of rows) handleCents += r.stakeCents
  return { tickets: rows.length, handleCents }
}

/** Round a set of shares that sum to ~100 to INTEGERS that sum to exactly 100 (largest-remainder),
 *  so a market's displayed bets%/handle% never read 99 or 101. Pure; for display only — the
 *  projection keeps the raw fractions. Order is preserved (the i-th input maps to the i-th output). */
export function roundShares(values: number[]): number[] {
  const floors = values.map((v) => Math.floor(v))
  const target = Math.round(values.reduce((a, b) => a + b, 0))
  let remainder = target - floors.reduce((a, b) => a + b, 0)
  const out = [...floors]
  const byFrac = values
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; remainder > 0 && k < byFrac.length; k++, remainder--) out[byFrac[k].i] += 1
  return out
}
