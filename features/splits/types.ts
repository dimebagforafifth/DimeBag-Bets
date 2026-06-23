/**
 * Public betting splits — the read-only projection's shapes.
 *
 * A "split" answers the public-interest question for one market: of the action placed on
 * it, what share of TICKETS (bet count) and what share of HANDLE (credits staked) sits on
 * each side. Everything here is a pure projection over recorded bets — it carries no money
 * path and mints nothing (see splits.ts for the derivation + the reconciliation invariant).
 *
 * Credit/balance only — `handleCents` / `stakeCents` are integer cents (points, no cash value).
 */

import type { MarketType } from '../../lib/odds/contract.js'

/**
 * A minimal, read-only view of ONE placed bet leg — the projection's input row, derived
 * from a recorded BookBet leg. It carries only the dimensions a split groups by plus the
 * stake riding on the leg's market. No account balance, no money mutator.
 */
export interface SplitBet {
  /** The recorded bet id (BookBet.id) — for tracing only. */
  betId: string
  accountId: string
  marketId: string
  marketType: MarketType
  /** 'home' | 'away' | 'over' | 'under' (or a prop side). */
  side: string
  /** Human pick label (e.g. "Lakers −3.5", "Over 224.5"). */
  pick: string
  eventId: string
  eventLabel: string
  leagueId: string
  sport?: string
  /** Cents of stake riding on this leg's market. A single rides its one stake; a parlay
   *  rides its WHOLE stake on each leg's market (standard "money exposed to this side"). */
  stakeCents: number
}

/** One side of a market's split (the bets%-vs-handle% for that side). */
export interface SideSplit {
  side: string
  /** A representative pick label for the side. */
  pick: string
  /** Number of tickets (legs) on this side. */
  tickets: number
  /** Σ stake on this side, cents. */
  handleCents: number
  /** tickets ÷ market tickets × 100 (0..100). Across a market's sides these sum to 100. */
  ticketPct: number
  /** handle ÷ market handle × 100 (0..100). Across a market's sides these sum to 100. */
  handlePct: number
}

/** The full bets%-vs-handle% split for one market. */
export interface MarketSplit {
  marketId: string
  marketType: MarketType
  eventId: string
  eventLabel: string
  leagueId: string
  sport?: string
  /** Σ tickets across sides. */
  totalTickets: number
  /** Σ handle across sides, cents. */
  totalHandleCents: number
  /** The sides, sorted by handle desc (the public's heaviest side first). */
  sides: SideSplit[]
}

/** Rank the most-bet markets by ticket count or by handle. */
export type RankBy = 'tickets' | 'handle'

/** A market in the "most-bet" discovery ranking. */
export interface RankedMarket {
  rank: number
  split: MarketSplit
  /** The side the public leans on (heaviest handle), for a one-line summary; null if no action. */
  lean: SideSplit | null
}

/** The reconciliation totals — what the projection attributed, to check against its inputs. */
export interface SplitReconciliation {
  /** Σ tickets across every market+side. Must equal Σ legs across the input bets. */
  tickets: number
  /** Σ handle across every market+side, cents. Must equal Σ stake-per-leg across the inputs. */
  handleCents: number
}
