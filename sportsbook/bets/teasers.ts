/**
 * Teasers (CLAUDE.md §4) — a classic football/basketball book bet.
 *
 * A teaser is a parlay where you move every leg's spread or total in YOUR favour
 * by a fixed number of points, in exchange for a lower combined price. A 2-team
 * 6-point football teaser nudges each line 6 points your way and pays around
 * −110. Every leg must still win at the teased number.
 *
 * Lines are expressed as the picked side's own handicap (so a home pick laying 3
 * has `line = -3`; teasing +6 makes it +3). Pure adjustment + grading + the
 * standard payout tables; placement/settlement is left to `core`.
 */

import { decimalFromAmerican } from '../odds.js'

export type TeaserSport = 'football' | 'basketball'
export type TeaserMarket = 'spread' | 'total'
export type TeaserPick = 'home' | 'away' | 'over' | 'under'
export type LegGrade = 'win' | 'loss' | 'push'

export interface TeaserTable {
  sport: TeaserSport
  points: number
  /** American payout keyed by number of (effective) legs. */
  payouts: Record<number, number>
}

/**
 * Representative Vegas/online teaser payouts. Exact prices vary by book, so these
 * are a sane default the manager layer can override.
 */
export const TEASER_TABLES: TeaserTable[] = [
  { sport: 'football', points: 6, payouts: { 2: -110, 3: 160, 4: 260, 5: 400, 6: 600 } },
  { sport: 'football', points: 6.5, payouts: { 2: -120, 3: 150, 4: 240, 5: 350, 6: 500 } },
  { sport: 'football', points: 7, payouts: { 2: -130, 3: 140, 4: 220, 5: 300, 6: 450 } },
  { sport: 'basketball', points: 4, payouts: { 2: -110, 3: 160, 4: 260, 5: 400, 6: 600 } },
  { sport: 'basketball', points: 4.5, payouts: { 2: -120, 3: 150, 4: 240, 5: 350, 6: 500 } },
  { sport: 'basketball', points: 5, payouts: { 2: -130, 3: 140, 4: 220, 5: 300, 6: 450 } },
]

export function findTeaserTable(sport: TeaserSport, points: number): TeaserTable | undefined {
  return TEASER_TABLES.find((t) => t.sport === sport && t.points === points)
}

/** The combined decimal price of a teaser, from the table for the leg count. */
export function teaserDecimal(sport: TeaserSport, points: number, legCount: number): number {
  const table = findTeaserTable(sport, points)
  const american = table?.payouts[legCount]
  if (american === undefined) {
    throw new Error(`no teaser payout for ${sport} ${points}pt with ${legCount} legs`)
  }
  return decimalFromAmerican(american)
}

/**
 * Move a leg's line in the bettor's favour by `points`. A spread grows the
 * picked side's handicap; a total comes down for over, up for under.
 */
export function teaseLine(market: TeaserMarket, pick: TeaserPick, line: number, points: number): number {
  if (!(points > 0)) throw new Error(`teaser points must be > 0, got ${points}`)
  if (market === 'spread') return line + points
  return pick === 'over' ? line - points : line + points
}

/** Grade a single teased leg against the final score. */
export function gradeTeaserLeg(
  market: TeaserMarket,
  pick: TeaserPick,
  line: number,
  points: number,
  homeScore: number,
  awayScore: number,
): LegGrade {
  const adj = teaseLine(market, pick, line, points)
  if (market === 'spread') {
    const margin = pick === 'home' ? homeScore - awayScore + adj : awayScore - homeScore + adj
    return margin > 0 ? 'win' : margin < 0 ? 'loss' : 'push'
  }
  const sum = homeScore + awayScore
  if (sum === adj) return 'push'
  const wentOver = sum > adj
  return (pick === 'over') === wentOver ? 'win' : 'loss'
}

export interface TeaserLeg {
  market: TeaserMarket
  pick: TeaserPick
  line: number
}

export interface TeaserResult {
  home: number
  away: number
}

export interface TeaserGrade {
  outcome: 'win' | 'loss' | 'push'
  /** Payout decimal: the teaser price on a win, 1 on a push (stake back), 0 on a loss. */
  decimal: number
  /** Legs still live after pushes drop out — what the teaser re-priced on. */
  effectiveLegs: number
  legGrades: LegGrade[]
}

/**
 * Grade a full teaser. Any losing leg loses the teaser. The push rule decides
 * what a tie does:
 *  - `'reduce'` (default, most books) — a push drops out and the teaser re-prices
 *    on the remaining legs; if fewer than 2 remain, the stake is returned (push).
 *  - `'loss'` — ties lose (some books); any push loses the teaser.
 */
export function gradeTeaser(
  legs: TeaserLeg[],
  points: number,
  results: TeaserResult[],
  sport: TeaserSport,
  pushRule: 'reduce' | 'loss' = 'reduce',
): TeaserGrade {
  if (legs.length < 2) throw new Error(`a teaser needs ≥2 legs, got ${legs.length}`)
  if (results.length !== legs.length) {
    throw new Error(`need one result per leg (${legs.length}), got ${results.length}`)
  }
  const legGrades = legs.map((leg, i) =>
    gradeTeaserLeg(leg.market, leg.pick, leg.line, points, results[i].home, results[i].away),
  )
  const wins = legGrades.filter((g) => g === 'win').length

  if (legGrades.includes('loss')) {
    return { outcome: 'loss', decimal: 0, effectiveLegs: wins, legGrades }
  }
  if (pushRule === 'loss' && legGrades.includes('push')) {
    return { outcome: 'loss', decimal: 0, effectiveLegs: wins, legGrades }
  }
  // 'reduce': pushes drop out; re-price on the wins.
  if (wins < 2) {
    return { outcome: 'push', decimal: 1, effectiveLegs: wins, legGrades }
  }
  return { outcome: 'win', decimal: teaserDecimal(sport, points, wins), effectiveLegs: wins, legGrades }
}
