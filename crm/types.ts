/**
 * CRM + integrity types — the shared contract for the native back-office moat
 * (white paper §"invest disproportionately here"). Everything here is READ-ONLY
 * over the existing data: derived from the durable analytics feed
 * (manager/reporting), the sportsbook bets store, the org tree, and a synthesized
 * integrity-signals layer. No money path, no mutation — money only ever moves
 * through `core` elsewhere. All amounts are integer cents.
 */

/* ============================ integrity signals ============================ */

/** One observed session for a player (synthesized today; see crm/signals.ts —
 *  // SEAM: fed by real auth/session telemetry once it exists). */
export interface SessionStamp {
  at: number // epoch ms the session started
  deviceId: string // stable per-browser fingerprint
  ipHash: string // coarse network id (a /24-style bucket, hashed)
  durationMin: number // session length in minutes
}

/**
 * Per-player integrity telemetry. There is NO device/IP/session data anywhere in
 * the app today, so this is synthesized deterministically for the demo and is the
 * single seam a real deployment would feed from session/auth telemetry.
 */
export interface PlayerSignals {
  playerId: string
  signupAt: number // epoch ms — also the cohort-entry time
  deviceIds: string[] // distinct devices seen (shared device ⇒ multi-account signal)
  ipHashes: string[] // distinct networks seen
  sessions: SessionStamp[] // recent sessions (recency/velocity)
  referrerId?: string // who referred them (rakeback/referral-ring signal)
}

/* ============================ behaviour profile =========================== */

/** A player's stake level, bucketed from typical stake size. */
export type StakeTier = 'micro' | 'low' | 'mid' | 'high' | 'whale'

/** How a player splits their handle across products. */
export type ProductLean = 'casino' | 'sportsbook' | 'mixed'

/**
 * The derived behavioural profile for one player — the feature vector segments,
 * lifecycle and risk all read. Pure function of the analytics feed + bets + signals
 * (see crm/behavior.ts). Amounts in cents.
 */
export interface BehaviorFeatures {
  playerId: string
  name: string
  /* volume */
  bets: number
  turnoverCents: number // total staked
  netCents: number // player's signed net (− = the book is up on them)
  /* stake level */
  avgStakeCents: number
  medianStakeCents: number
  stakeTier: StakeTier
  /* product / game preference */
  topGameKey: string // most-played game key ('' if none)
  topGameName: string
  topGameShare: number // 0..1 of bets on the top game (concentration)
  casinoShare: number // 0..1 of turnover on casino games
  sportsbookShare: number // 0..1 of turnover on the sportsbook
  productLean: ProductLean
  /* sportsbook shape */
  parlayShare: number // 0..1 of sportsbook bets that are parlays
  sgpShare: number // 0..1 of sportsbook bets that are same-game parlays
  /* cadence */
  signupAt: number
  daysSinceSignup: number
  firstActive: number
  lastActive: number
  recencyDays: number // days since last bet
  activeDays: number // distinct UTC days with a bet
  betsPerActiveDay: number
  topUps: number // credit/bonus grants received (no-cash "top-up" proxy)
  /* sessions */
  sessions: number
  avgSessionMin: number
  /* outcomes + churn */
  winRate: number // 0..1 of resolved bets that won
  churnRisk: number // 0..1 — likelihood the player is lapsing
}

/* ============================== segments ================================== */

/** A wagering-native behavioural archetype (richer than the legacy
 *  New/Casual/VIP/Dormant in app/console/segments.ts, which this complements). */
export type CrmSegment =
  | 'whale' // very high stake / turnover
  | 'grinder' // high frequency, small-to-mid stakes
  | 'sports-regular' // sportsbook-leaning, steady
  | 'parlay-lotto' // long-shot parlay/SGP chaser
  | 'casino-regular' // casino-leaning, steady
  | 'casual' // low frequency, low stakes
  | 'new' // just signed up
  | 'dormant' // lapsed

/** Where a player sits in the lifecycle (the brief's four, plus reactivated). */
export type LifecycleStage = 'onboarding' | 'habit' | 'vip' | 'at-risk' | 'dormant' | 'reactivated'

export interface SegmentResult {
  playerId: string
  segment: CrmSegment
  lifecycle: LifecycleStage
  /** Short descriptive dimension tags (stake tier, product lean, churn band, …). */
  tags: string[]
}

/* =============================== risk ==================================== */

export type RiskBand = 'clean' | 'watch' | 'sharp' | 'flagged'

export interface RiskReason {
  code: string
  label: string
  weight: number // contribution to the score (points)
  detail: string
}

/** Per-market win-rate breakdown (sportsbook), feeding the risk read. */
export interface MarketWinRate {
  market: string // 'moneyline' | 'spread' | 'total' | 'prop' | a casino game key
  bets: number
  winRate: number // 0..1
}

/**
 * Integrity / sharpness risk for one player — distinct from Agent A's FINANCIAL
 * exposure. Scores how likely a player is beating the book through skill/timing
 * (a sharp the operator may want to limit), 0 (clean) … 100 (flagged).
 */
export interface RiskScore {
  playerId: string
  score: number // 0..100
  band: RiskBand
  /** Avg edge of taken price vs the locked de-vigged true prob (a CLV proxy). */
  clvEdgePct: number
  /** 0..1 — how much value the player captures by timing lines/props. */
  lineTimingScore: number
  winRate: number
  marketWinRates: MarketWinRate[]
  reasons: RiskReason[]
}

/* =============================== abuse ================================== */

export type AbuseKind = 'multi-account' | 'collusion' | 'rakeback-abuse' | 'leaderboard-gaming'

export interface AbuseFlag {
  playerId: string
  kind: AbuseKind
  severity: 'low' | 'medium' | 'high'
  detail: string
  relatedPlayerIds: string[]
}

export type ClusterKind = 'shared-device' | 'shared-ip' | 'collusion-ring' | 'referral-ring'

/** A group of accounts linked by a shared integrity signal. */
export interface AbuseCluster {
  id: string
  kind: ClusterKind
  playerIds: string[]
  sharedKeys: string[] // the device ids / ip hashes / referrer that link them
  severity: 'low' | 'medium' | 'high'
  evidence: string
}

/* ============================ joined profile ============================= */

export interface CrmPlayerRef {
  id: string
  name: string
  role: string
  agentId: string | null
}

/** The whole CRM picture for one player — the join the dashboard renders. */
export interface CrmProfile {
  player: CrmPlayerRef
  behavior: BehaviorFeatures
  segment: SegmentResult
  risk: RiskScore
  abuseFlags: AbuseFlag[]
}
