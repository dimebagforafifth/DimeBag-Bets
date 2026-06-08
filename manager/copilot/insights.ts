/**
 * The Copilot's insight engine — PURE analysis that turns a book snapshot into
 * ranked, explained recommendations. ADVISORY ONLY by construction: it returns data
 * (a recommendation has text + a suggested next step + which page to act on); it
 * holds no write access and executes nothing. The manager reads and decides.
 *
 * Today this is a deterministic rules engine (no external dependency, fully
 * testable). The "premium" upgrade swaps it for an LLM behind this same
 * `analyze(snapshot) -> Recommendation[]` interface — still advisory, still
 * manager-approved.
 */

import { formatMoney } from '../../games/shared/money.js'
import type { BookSnapshot } from './snapshot.js'

export type Priority = 'high' | 'medium' | 'low'
export type Area = 'risk' | 'promotions' | 'reporting' | 'communication' | 'general'

export interface Recommendation {
  id: string
  priority: Priority
  area: Area
  /** The headline finding. */
  title: string
  /** The analysis — what the data shows and why it matters. */
  detail: string
  /** The advisory next step (the MANAGER performs it; the copilot never does). */
  suggestedAction: string
}

const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
const pct = (n: number): string => `${(n * 100).toFixed(1)}%`

export function analyze(s: BookSnapshot): Recommendation[] {
  // TODO(api): the premium LLM swaps in HERE, behind this exact
  // `analyze(snapshot) -> Recommendation[]` signature. Today it is the deterministic
  // rules engine below (no external dependency, fully testable, never acts). A real
  // model would read the same read-only snapshot and return the same shape — still
  // advisory, still manager-approved — so callers and the UI never change.
  const recs: Recommendation[] = []
  const a = s.activity

  // Risk — book exposure near the limit.
  if (s.creditUtilization >= 0.8) {
    recs.push({
      id: 'exposure',
      priority: 'high',
      area: 'risk',
      title: 'Book exposure is high',
      detail: `Credit utilization is ${(s.creditUtilization * 100).toFixed(0)}% of the book's limit.`,
      suggestedAction: 'Review per-player credit limits and tighten max bets before extending more credit.',
    })
  }

  // Risk — players net ahead over a meaningful sample (variance vs. a real leak).
  if (a.bets >= 50 && a.holdPct < 0) {
    recs.push({
      id: 'negative-hold',
      priority: 'high',
      area: 'risk',
      title: 'Players are net ahead this window',
      detail: `Hold is ${pct(a.holdPct)} over ${a.bets} bets — players are up ${formatMoney(a.playerNet)}.`,
      suggestedAction: 'Variance usually reverts to the house edge; confirm no game is mispriced and watch exposure.',
    })
  }

  // Risk — turnover concentrated in one player.
  if (s.topPlayers.length >= 2 && a.turnover > 0) {
    const share = s.topPlayers[0].turnover / a.turnover
    if (share >= 0.5) {
      recs.push({
        id: 'concentration',
        priority: 'medium',
        area: 'risk',
        title: 'Turnover is concentrated in one player',
        detail: `The top player drives ${(share * 100).toFixed(0)}% of turnover this window.`,
        suggestedAction: 'One player swings the book — keep their limit and exposure under close review.',
      })
    }
  }

  // Promotions — dormant players + weak retention.
  if (s.engagement.dormant > 0 && s.engagement.retentionPct < 0.5) {
    recs.push({
      id: 'reengage',
      priority: 'medium',
      area: 'promotions',
      title: 'Win back dormant players',
      detail: `${s.engagement.dormant} player(s) have gone dormant; week-over-week retention is ${pct(s.engagement.retentionPct)}.`,
      suggestedAction: 'Send a small free-play bonus to the dormant downline from Promotions, then post an announcement.',
    })
  }

  // Promotions — bonus spend outpacing revenue.
  if (a.bonusCost > 0 && a.bonusCost > a.houseGGR) {
    recs.push({
      id: 'bonus-roi',
      priority: 'medium',
      area: 'promotions',
      title: 'Bonus spend is outpacing revenue',
      detail: `Bonuses (${formatMoney(a.bonusCost)}) exceed gaming revenue (${formatMoney(a.houseGGR)}) this window.`,
      suggestedAction: 'Trim bonus size or target players who then wager, and track hold afterward.',
    })
  }

  // Communication — no play at all.
  if (a.bets === 0) {
    recs.push({
      id: 'no-activity',
      priority: 'low',
      area: 'communication',
      title: 'No play in this window',
      detail: 'No wagers were placed in the selected window.',
      suggestedAction: 'Post an announcement or drop a free-play bonus to spark activity.',
    })
  }

  // Healthy — nothing flagged.
  if (recs.length === 0) {
    recs.push({
      id: 'healthy',
      priority: 'low',
      area: 'general',
      title: 'Book looks healthy',
      detail: `Hold ${pct(a.holdPct)} over ${a.bets} bets; ${s.engagement.active} active player(s); exposure ${(s.creditUtilization * 100).toFixed(0)}%.`,
      suggestedAction: 'No action needed — keep an eye on exposure as volume grows.',
    })
  }

  return recs.sort((x, y) => RANK[x.priority] - RANK[y.priority])
}
