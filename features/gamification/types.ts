/**
 * Gamification model (CLAUDE.md §2, §3). Missions, achievements, XP, tournaments, and a
 * daily reward wheel — every reward pays out as FREE-PLAY through the shared `core.grant`
 * (the same path VIP uses); no new money is tracked here. All amounts are integer CENTS.
 *
 * The config (operator-tunable: prize pools, schedules, win probabilities) and the
 * per-player progress state are kept separate, so the operator can re-tune without
 * touching live progress.
 */

/* ------------------------------ missions -------------------------------- */

/** How often a mission refreshes. */
export type MissionCadence = 'daily' | 'weekly'
/** What a mission counts. `wagered` is in cents; the others are counts. */
export type MissionMetric = 'bets' | 'wagered' | 'wins'

export interface MissionDef {
  id: string
  title: string
  description: string
  cadence: MissionCadence
  metric: MissionMetric
  /** Target to reach within the period (bet count / wagered cents / win count). */
  target: number
  /** Free-play granted on claim (cents). */
  rewardCents: number
  /** XP granted on claim. */
  xp: number
  enabled: boolean
}

/** A player's progress on one mission for the CURRENT period. */
export interface MissionProgress {
  defId: string
  /** Which day/week this progress belongs to — a change refreshes it. */
  periodKey: string
  progress: number
  completedAt: number | null
  claimed: boolean
}

/* ---------------------------- achievements ------------------------------ */

/** Lifetime stat an achievement is earned against. */
export type AchievementMetric = 'lifetimeBets' | 'lifetimeWagered' | 'lifetimeWins' | 'level'

export interface AchievementDef {
  id: string
  title: string
  description: string
  /** A short badge glyph (emoji) shown when earned. */
  badge: string
  metric: AchievementMetric
  threshold: number
  rewardCents: number
  xp: number
  enabled: boolean
}

/** Per-player record of an earned achievement. */
export interface AchievementState {
  unlockedAt: number
  claimed: boolean
}

/* ------------------------------- wheel ---------------------------------- */

export interface WheelSegment {
  id: string
  label: string
  rewardCents: number
  /** Relative weight; the probability of a segment is its weight ÷ total weight. */
  weight: number
}

export interface WheelConfig {
  enabled: boolean
  /** How often a player may spin (hours). 24 = once daily. */
  cooldownHours: number
  segments: WheelSegment[]
}

/* ---------------------------- tournaments ------------------------------- */

/** What a tournament ranks players by. `profit` = net figure change (can be negative). */
export type TournamentMetric = 'wagered' | 'profit' | 'wins'

export interface TournamentDef {
  id: string
  name: string
  metric: TournamentMetric
  /** Window (epoch ms). Scores accrue while now ∈ [startsAt, endsAt); settles after. */
  startsAt: number
  endsAt: number
  /** Total prize pool (cents), split across the top places by `payoutPct`. */
  prizePoolCents: number
  /** Fraction of the pool to ranks 1..N (e.g. [0.5, 0.3, 0.2]); should sum to ≤ 1. */
  payoutPct: number[]
  enabled: boolean
}

/* ------------------------------ player ---------------------------------- */

/** All per-player gamification state. Keyed in the store by the member/account id. */
export interface PlayerState {
  id: string
  xp: number
  lifetimeBets: number
  lifetimeWagered: number
  lifetimeWins: number
  /** Current period progress, by mission def id. */
  missions: Record<string, MissionProgress>
  /** Earned achievements, by achievement def id. */
  achievements: Record<string, AchievementState>
  /** Last wheel spin (epoch ms), or null if never. */
  wheelLastSpinAt: number | null
  /** Score per tournament id (accrues from play while the window is open). */
  tournamentScores: Record<string, number>
  /** Tournaments this player has already been paid for (settlement idempotency). */
  tournamentPaid: Record<string, true>
}

/** The whole operator-tunable config. */
export interface GamificationConfig {
  missions: MissionDef[]
  achievements: AchievementDef[]
  wheel: WheelConfig
  tournaments: TournamentDef[]
}

/* ------------------------------ results --------------------------------- */

/** A single reward payout (what was granted, and why) — returned by claim actions. */
export interface RewardResult {
  cents: number
  xp: number
  /** Human-readable lines describing what was awarded (for the UI/log). */
  items: string[]
}

/** One ranked tournament row. */
export interface TournamentStanding {
  position: number
  id: string
  name: string
  score: number
  /** Prize for this position under the current config (cents); 0 if out of the money. */
  prizeCents: number
}
