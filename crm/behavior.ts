/**
 * Behaviour feature extraction — the heart of the CRM. Turns the durable analytics
 * feed + sportsbook bets + integrity signals into one BehaviorFeatures vector per
 * player, which segments / lifecycle / risk all read. Pure + structural inputs
 * (no app-store imports) so it unit-tests in isolation. Read-only; cents throughout.
 */

import type { BehaviorFeatures, PlayerSignals, ProductLean, StakeTier } from './types.js'

const DAY = 86_400_000

/** A resolved money event — structurally the analytics feed's AnalyticsRecord. */
export interface RecordLike {
  time: number
  accountId: string
  gameKey: string
  game: string
  kind: 'wager' | 'bonus'
  stake: number
  profit: number
  multiplier: number
  outcome: string
}

/** A sportsbook bet, reduced to the shape behaviour needs (adapted in crm/data.ts
 *  from BookBet: isParlay = mode==='parlay', isSgp = parlay with all legs same event). */
export interface BetLike {
  accountId: string
  isParlay: boolean
  isSgp: boolean
}

export interface BehaviorInput {
  members: { id: string; name: string }[]
  records: RecordLike[]
  bets: BetLike[]
  signals: Map<string, PlayerSignals>
  now: number
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/** Stake tier from the player's TYPICAL (median) stake, in cents. */
export function stakeTierOf(medianStakeCents: number): StakeTier {
  if (medianStakeCents >= 50_000) return 'whale' // ≥ $500
  if (medianStakeCents >= 10_000) return 'high' // ≥ $100
  if (medianStakeCents >= 2_000) return 'mid' // ≥ $20
  if (medianStakeCents >= 500) return 'low' // ≥ $5
  return 'micro'
}

function leanOf(casinoShare: number, sportsbookShare: number): ProductLean {
  if (casinoShare >= 0.7) return 'casino'
  if (sportsbookShare >= 0.7) return 'sportsbook'
  return 'mixed'
}

/**
 * Churn risk in [0,1]. Rises with how long it's been since the last bet RELATIVE
 * to the player's own cadence: a daily player gone 5 days is more at-risk than a
 * monthly player gone 5 days. Brand-new players with little history start mid-low.
 */
export function churnRiskOf(opts: {
  recencyDays: number
  activeDays: number
  ageDays: number
  bets: number
}): number {
  const { recencyDays, activeDays, ageDays, bets } = opts
  if (bets === 0) return 0.5 // signed up, never played — neutral-ish, "onboarding" risk
  // typical days between active sessions over their lifetime (≥1)
  const cadence = Math.max(1, ageDays / Math.max(1, activeDays))
  // how many "cadences" of silence — 1 is on-schedule, 3+ is lapsing
  const lapses = recencyDays / cadence
  const fromLapse = clamp01((lapses - 0.8) / 3.2)
  // a low-frequency player is inherently more fragile
  const fromFreq = clamp01((6 - activeDays) / 12)
  return clamp01(0.7 * fromLapse + 0.3 * fromFreq)
}

/** Derive the BehaviorFeatures vector for every member. */
export function deriveBehavior(input: BehaviorInput): BehaviorFeatures[] {
  const { members, records, bets, signals, now } = input

  // index records + bets by player
  const recsBy = new Map<string, RecordLike[]>()
  for (const r of records) {
    const list = recsBy.get(r.accountId) ?? []
    list.push(r)
    recsBy.set(r.accountId, list)
  }
  const betsBy = new Map<string, BetLike[]>()
  for (const b of bets) {
    const list = betsBy.get(b.accountId) ?? []
    list.push(b)
    betsBy.set(b.accountId, list)
  }

  return members.map((m) => {
    const recs = recsBy.get(m.id) ?? []
    const wagers = recs.filter((r) => r.kind === 'wager')
    const sig = signals.get(m.id)

    const stakes = wagers.map((r) => r.stake)
    const turnoverCents = stakes.reduce((a, s) => a + s, 0)
    const netCents = wagers.reduce((a, r) => a + r.profit, 0)
    const avgStakeCents = wagers.length ? Math.round(turnoverCents / wagers.length) : 0
    const medianStakeCents = median(stakes)

    // game preference + product split (by turnover)
    const gameCount = new Map<string, { name: string; n: number }>()
    let casinoTurn = 0
    let sportsTurn = 0
    for (const r of wagers) {
      const g = gameCount.get(r.gameKey) ?? { name: r.game, n: 0 }
      g.n += 1
      gameCount.set(r.gameKey, g)
      if (r.gameKey === 'sportsbook') sportsTurn += r.stake
      else casinoTurn += r.stake
    }
    let topGameKey = ''
    let topGameName = ''
    let topN = 0
    for (const [k, g] of gameCount) {
      if (g.n > topN) {
        topN = g.n
        topGameKey = k
        topGameName = g.name
      }
    }
    const topGameShare = wagers.length ? topN / wagers.length : 0
    const casinoShare = turnoverCents ? casinoTurn / turnoverCents : 0
    const sportsbookShare = turnoverCents ? sportsTurn / turnoverCents : 0

    // sportsbook shape
    const pb = betsBy.get(m.id) ?? []
    const parlays = pb.filter((b) => b.isParlay).length
    const sgps = pb.filter((b) => b.isSgp).length
    const parlayShare = pb.length ? parlays / pb.length : 0
    const sgpShare = pb.length ? sgps / pb.length : 0

    // cadence
    const times = wagers.map((r) => r.time)
    const firstActive = times.length ? Math.min(...times) : 0
    const lastActive = times.length ? Math.max(...times) : 0
    const signupAt = sig?.signupAt ?? firstActive ?? now
    const daysSinceSignup = Math.max(0, Math.floor((now - signupAt) / DAY))
    const recencyDays = lastActive ? Math.floor((now - lastActive) / DAY) : daysSinceSignup
    const activeDays = new Set(times.map((t) => Math.floor(t / DAY))).size
    const betsPerActiveDay = activeDays ? wagers.length / activeDays : 0
    const topUps = recs.filter((r) => r.kind === 'bonus').length

    // sessions
    const sessions = sig?.sessions.length ?? 0
    const avgSessionMin = sessions
      ? Math.round(sig!.sessions.reduce((a, s) => a + s.durationMin, 0) / sessions)
      : 0

    // outcomes
    const resolved = wagers.length
    const wins = wagers.filter((r) => r.outcome === 'win').length
    const winRate = resolved ? wins / resolved : 0

    const churnRisk = churnRiskOf({
      recencyDays,
      activeDays,
      ageDays: daysSinceSignup,
      bets: wagers.length,
    })

    return {
      playerId: m.id,
      name: m.name,
      bets: wagers.length,
      turnoverCents,
      netCents,
      avgStakeCents,
      medianStakeCents,
      stakeTier: stakeTierOf(medianStakeCents),
      topGameKey,
      topGameName,
      topGameShare,
      casinoShare,
      sportsbookShare,
      productLean: leanOf(casinoShare, sportsbookShare),
      parlayShare,
      sgpShare,
      signupAt,
      daysSinceSignup,
      firstActive,
      lastActive,
      recencyDays,
      activeDays,
      betsPerActiveDay,
      topUps,
      sessions,
      avgSessionMin,
      winRate,
      churnRisk,
    }
  })
}
