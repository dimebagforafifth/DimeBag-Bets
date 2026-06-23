/**
 * Player INTEGRITY risk-scoring — how likely a player is beating the book through
 * skill / value-timing (a "sharp" the operator may want to limit), distinct from
 * Agent A's financial exposure. Pure over a player's behaviour + their sportsbook
 * bets. Read-only.
 *
 * The CLV proxy: each leg locks `trueProb` (the de-vigged book estimate at add
 * time) alongside the taken `decimal` price. A leg's value edge is
 * `decimal * trueProb − 1` — positive means the player took a +EV price (beat the
 * book's own no-vig line); persistently positive edge is the strongest sharp tell.
 * (No closing line is recorded — // SEAM: feed real CLV when closing prices land.)
 */

import type { BehaviorFeatures, MarketWinRate, RiskBand, RiskReason, RiskScore } from './types.js'

export interface RiskLeg {
  marketType: string // 'moneyline' | 'spread' | 'total' | 'prop'
  decimal: number // taken price (≥ 1)
  trueProb?: number // locked de-vigged prob (0..1), if known
}

export interface RiskBet {
  isParlay: boolean
  settled: boolean
  won: boolean
  /** push / void — stake returned, no decision; excluded from win-rate. */
  pushed?: boolean
  legs: RiskLeg[]
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)
const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n)

export function bandOf(score: number): RiskBand {
  if (score >= 75) return 'flagged'
  if (score >= 50) return 'sharp'
  if (score >= 25) return 'watch'
  return 'clean'
}

/** Win-rate per sportsbook market, from SINGLE settled bets (parlays don't
 *  decompose into per-leg outcomes in the store). */
export function marketWinRates(bets: RiskBet[]): MarketWinRate[] {
  const by = new Map<string, { bets: number; wins: number }>()
  for (const b of bets) {
    if (b.isParlay || !b.settled || b.pushed || b.legs.length !== 1) continue
    const m = b.legs[0].marketType
    const e = by.get(m) ?? { bets: 0, wins: 0 }
    e.bets += 1
    if (b.won) e.wins += 1
    by.set(m, e)
  }
  return [...by.entries()]
    .map(([market, e]) => ({ market, bets: e.bets, winRate: e.bets ? e.wins / e.bets : 0 }))
    .sort((a, b) => b.bets - a.bets)
}

/**
 * Score a player's integrity risk in [0,100]. Drivers:
 *  - CLV edge: average leg value edge (decimal·trueProb − 1), the primary signal
 *  - overperformance: realized win-rate above the rate their taken prices imply
 *  - line-timing: share of legs taken at a +EV price
 * all scaled by a sample-size CONFIDENCE so a 3-bet hot streak can't read as sharp.
 */
export function scoreRisk(b: BehaviorFeatures, bets: RiskBet[]): RiskScore {
  const legs = bets
    .flatMap((x) => x.legs)
    .filter((l) => typeof l.trueProb === 'number' && l.trueProb! > 0)
  const edges = legs.map((l) => l.decimal * (l.trueProb as number) - 1)
  const clvEdge = edges.length ? edges.reduce((a, e) => a + e, 0) / edges.length : 0
  const clvEdgePct = clvEdge * 100

  // Overperformance compares realized vs implied win-rate over the SAME population:
  // settled, decided (not push/void), priced SINGLE sportsbook bets — so an all-product
  // behaviour win-rate is never subtracted from a sportsbook-implied one (mismatched
  // populations). Parlays don't decompose into per-leg outcomes, so they're excluded.
  const pricedSingles = bets.filter(
    (x) =>
      !x.isParlay &&
      x.settled &&
      !x.pushed &&
      x.legs.length === 1 &&
      typeof x.legs[0].trueProb === 'number' &&
      (x.legs[0].trueProb as number) > 0,
  )
  const realizedWin = pricedSingles.length
    ? pricedSingles.filter((x) => x.won).length / pricedSingles.length
    : 0
  const impliedWin = pricedSingles.length
    ? pricedSingles.reduce((a, x) => a + (x.legs[0].trueProb as number), 0) / pricedSingles.length
    : 0
  const overperf = pricedSingles.length ? realizedWin - impliedWin : 0 // >0 ⇒ winning more than priced

  const posShare = edges.length ? edges.filter((e) => e > 0).length / edges.length : 0
  const lineTimingScore = clamp01(posShare)

  // confidence ramps with volume; a thin record can't score "sharp"
  const confidence = clamp01(b.bets / 30)

  // component points (pre-confidence)
  const clvPts = clamp(clvEdge * 600, -20, 55) // +5% avg edge ≈ +30 pts
  const overPts = clamp(overperf * 180, -15, 30) // +10% over implied ≈ +18 pts
  const timingPts = lineTimingScore * 25
  const raw = clamp(clvPts + overPts + timingPts, 0, 100)
  const score = Math.round(raw * confidence)

  const reasons: RiskReason[] = []
  if (clvEdgePct >= 1.5)
    reasons.push({
      code: 'clv-positive',
      label: 'Beats the de-vigged line',
      weight: Math.round(clamp(clvPts, 0, 55)),
      detail: `Avg value edge +${clvEdgePct.toFixed(1)}% across ${legs.length} priced legs.`,
    })
  if (overperf >= 0.06 && pricedSingles.length >= 10)
    reasons.push({
      code: 'overperforming',
      label: 'Wins above priced rate',
      weight: Math.round(clamp(overPts, 0, 30)),
      detail: `${Math.round(realizedWin * 100)}% win vs ${Math.round(impliedWin * 100)}% implied on ${pricedSingles.length} priced singles.`,
    })
  if (lineTimingScore >= 0.6 && legs.length >= 8)
    reasons.push({
      code: 'line-timing',
      label: 'Consistently times value',
      weight: Math.round(timingPts),
      detail: `${Math.round(posShare * 100)}% of legs taken at a +EV price.`,
    })
  if (confidence < 0.5 && raw >= 40)
    reasons.push({
      code: 'low-sample',
      label: 'Small sample',
      weight: 0,
      detail: `Only ${b.bets} bets — score discounted for variance.`,
    })

  return {
    playerId: b.playerId,
    score,
    band: bandOf(score),
    clvEdgePct,
    lineTimingScore,
    winRate: b.winRate,
    marketWinRates: marketWinRates(bets),
    reasons,
  }
}
