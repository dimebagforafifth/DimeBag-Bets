/**
 * Verified-records lane (round 2, Agent B) — the permanent, braggable, tamper-proof record.
 *
 * Everything here is a PROJECTION of settled, audited activity (the durable ledger). The
 * module owns no money path and mutates nothing — see records/record.ts for the derivation
 * and the integrity guarantees. Amounts are integer CENTS (credits — points-based, no cash
 * value), formatted with games/shared/money.
 */

import type { Outcome } from '../../core/index.js'
import type { BetRow, GameTotals } from '../../app/ledger-stats.js'
import type { RankProgress } from '../vip/index.js'

export type { BetRow }

/** A settled-activity summary over a set of bets (a period, a side, or lifetime). */
export interface PeriodStats {
  bets: number
  /** Σ stake, cents. */
  wagered: number
  /** Σ profit (signed), cents. */
  net: number
  wins: number
  losses: number
  /** push + void — no-action outcomes (stake returned). */
  pushes: number
  /** wins + losses (push/void excluded). */
  decided: number
  /** wins / decided, percent (0 when nothing decided). */
  winRate: number
  /** net / wagered, a fraction (0 when nothing wagered). Display as a percent. */
  roi: number
}

/** Win/loss streaks, push/void skipped (no-action never breaks or extends a streak). */
export interface StreakInfo {
  /** Length of the run of same-outcome decided bets ending at the most recent one. */
  current: number
  currentKind: 'win' | 'loss' | 'none'
  longestWin: number
  longestLoss: number
}

/** A single notable settled bet, for "biggest win/loss" and the recent feed. */
export interface BetHighlight {
  /** Ledger seq — a stable unique id (for React keys, and to trace the bet). */
  id: number
  gameKey: string
  game: string
  stake: number
  multiplier: number
  profit: number
  outcome: Outcome
  time: number
}

/**
 * Closing-line-value summary. CLV needs a closing price per bet, which the production ledger
 * does not yet capture — so this is honestly GATED: `available` is false (with a note) until
 * closing-line snapshots exist. Seeded demo data carries closing lines so the surface renders.
 */
export interface ClvSummary {
  available: boolean
  /** Bets that carried a closing line (the CLV sample). */
  sampleSize: number
  /** Percent of priced bets that beat the close (clv > 0). */
  beatRate: number
  /** Mean CLV across priced bets, as a percent. */
  avgClvPct: number
  note?: string
}

export type RecordBadgeTone = 'gold' | 'green' | 'red' | 'neutral'

/** A braggable badge — every one is DERIVED from the verified record (not hand-awarded). */
export interface RecordBadge {
  id: string
  label: string
  detail: string
  tone: RecordBadgeTone
}

/** Why the record reads as trustworthy: what it was derived from + a reproducible digest. */
export interface RecordIntegrity {
  /** The single source — settled, audited ledger resolutions. Never hand-entered. */
  source: 'settled-ledger'
  /** How many settled rows the record was derived from. */
  entriesConsidered: number
  /** True when seeded demo rows contributed (off in a real, keyed deployment). */
  demoSeeded: boolean
  /** sha256 over the contributing settled rows — recompute it to verify the record. */
  fingerprint: string
}

/** The full verified record for one account — a pure projection of settled activity. */
export interface VerifiedRecord {
  accountId: string
  name: string
  lifetime: PeriodStats
  periods: { day: PeriodStats; week: PeriodStats; month: PeriodStats }
  streak: StreakInfo
  biggestWin: BetHighlight | null
  biggestLoss: BetHighlight | null
  byGame: GameTotals[]
  side: { casino: PeriodStats; sportsbook: PeriodStats }
  clv: ClvSummary
  /** Tier/rank from the existing VIP ladder, computed off the VERIFIED lifetime wagered. */
  tier: RankProgress
  badges: RecordBadge[]
  recentBets: BetHighlight[]
  integrity: RecordIntegrity
}

/** A closing-line datapoint for one settled bet (the only input real CLV needs). */
export interface ClvDatum {
  accountId: string
  /** Decimal odds the bet was struck at. */
  betDecimal: number
  /** De-vigged fair probability at the close. */
  closeFairProb: number
  time: number
}

/** Everything buildRecord needs — all read-only, all traceable to settled activity. */
export interface RecordInput {
  accountId: string
  name: string
  rows: BetRow[]
  clv: ClvDatum[]
  now: number
  demoSeeded: boolean
}
