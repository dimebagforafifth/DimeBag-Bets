/**
 * Competitions & creators — the time-boxed events / tournament engine.
 *
 * A competition is a time-boxed contest ranked by a configurable metric off REAL settled
 * activity (read-only over the book ledger + bets — no module tracks its own points). Players
 * opt in (an optional entry fee HOLDS through `core`); at close the prize pool pays out
 * through `core`. Leaderboards are pure read-only projections.
 *
 * This file is the contract: the data shapes. The money path lives in `store.ts` (entries +
 * lifecycle), the standings in `leaderboard.ts`, and the metric math in `metrics.ts` — all
 * pure or core-routed. Credits/balance only; integer CENTS throughout.
 */

import type { Wager } from '../core/index.js'
import type { RankId } from '../vip/index.js'

/** What a competition ranks players by — each derived from settled activity in the window. */
export type MetricType =
  | 'wagered' // total credits wagered (turnover / handle), cents
  | 'net_profit' // net profit over the window (signed), cents
  | 'biggest_multiplier' // the single biggest winning multiplier hit (e.g. 12.5×)
  | 'parlay_hits' // count of winning parlays settled in the window
  | 'win_streak' // longest run of consecutive wins in the window

/** Themed / seasonal framing — pure presentation, drives copy + accent, not the math. */
export type CompetitionTheme =
  | 'weekly_race'
  | 'monthly_tournament'
  | 'seasonal'
  | 'holiday'
  | 'custom'

/** Settlement state. The TIME phase (upcoming / live / ended) is derived from the window;
 *  `settlement` tracks whether the operator has collected + paid. */
export type Settlement = 'open' | 'closed' | 'paid'

/** The full status surfaced to the UI: time phase while open, else the settlement state. */
export type CompetitionStatus = 'upcoming' | 'live' | 'ended' | 'closed' | 'paid'

/** Who may enter — read-only scoping over the org / VIP ladder (no money, no mutation). */
export type Eligibility =
  | { kind: 'all' }
  /** Only players in this agent's / master's downline roster. */
  | { kind: 'downline'; agentId: string }
  /** Only players who have reached at least this VIP rank (by lifetime wagered). */
  | { kind: 'vip_min'; minRank: RankId }

/** One row of a leaderboard — an entrant's metric value + rank. A read-only projection. */
export interface Standing {
  accountId: string
  name: string
  /** Metric-native value: cents (wagered / net), a count (parlay_hits / win_streak), or a
   *  multiple (biggest_multiplier). Use `formatMetricValue` to render. */
  value: number
  rank: number
  /** The prize this rank wins from the current pool (cents), 0 if out of the money. */
  prizeCents: number
}

/** A player's opt-in to a competition. The held entry-fee wager (if any) lives here so close
 *  can settle it through `core`. Seeded demo entries carry no wager (display only). */
export interface Entry {
  id: string
  competitionId: string
  accountId: string
  playerName: string
  joinedAt: number
  /** The core wager holding the entry fee (absent for free comps + seeded demo entries). */
  wager?: Wager
  stakeCents: number
}

/** What a rank was actually paid at close — the audited record (each pays via `core.grant`). */
export interface Payout {
  accountId: string
  name: string
  rank: number
  prizeCents: number
}

/** A seeded leaderboard row for the demo, so an event renders fully populated without
 *  depending on what's in the local ledger yet. Real (operator-created) competitions derive
 *  standings live from settled activity instead. */
export interface SeededStanding {
  accountId: string
  name: string
  value: number
}

export interface Competition {
  id: string
  name: string
  theme: CompetitionTheme
  metric: MetricType
  /** Scoring + entry window (epoch ms). Live while start ≤ now ≤ end. */
  startsAt: number
  endsAt: number
  /** Entry fee in cents (0 = free). Held through `core` on join. */
  entryFeeCents: number
  /** Operator-guaranteed prize pool in cents, added to collected entry fees. */
  guaranteedCents: number
  /** Prize split by rank — fraction of the pool, index 0 = 1st place. Sums to ≤ 1. */
  payoutSplit: number[]
  eligibility: Eligibility
  settlement: Settlement
  /** The operator / creator member id who authored it. */
  createdBy: string
  /** Optional themed accent/blurb for the creator's branding. */
  blurb?: string
  /** Demo display flag — standings come from `seededStandings` instead of the live ledger. */
  demo?: boolean
  seededStandings?: SeededStanding[]
  /** Prize pool snapshot taken at close (guaranteed + collected fees), cents. */
  prizePoolCents?: number
  /** What was paid, set at payout (or seeded for a finished demo event). */
  payouts?: Payout[]
  paidAt?: number
}
