/**
 * Player props (CLAUDE.md §4) — bets on an individual player's stat line.
 *
 * A prop is just an over/under on a projected stat, so it rides the same
 * `lines.ts` engine: project the player's number (`projection`) with a
 * stat-typical spread (`sd`), price both sides, and grade against the actual
 * result. The spreads below are rough per-stat defaults a manager can override.
 *
 * Pure model + thin wrappers + a small sample slate.
 */

import { priceLine, gradeOverUnder, overProbability, type OverUnder, type PricedLine } from './lines.js'

export type StatKey =
  | 'points'
  | 'rebounds'
  | 'assists'
  | 'threes'
  | 'pra' // points + rebounds + assists
  | 'passing_yards'
  | 'rushing_yards'
  | 'receiving_yards'
  | 'receptions'

/** Rough standard deviations per stat — the model's uncertainty scale. */
export const DEFAULT_STAT_SD: Record<StatKey, number> = {
  points: 9,
  rebounds: 3.5,
  assists: 3,
  threes: 1.6,
  pra: 11,
  passing_yards: 65,
  rushing_yards: 28,
  receiving_yards: 30,
  receptions: 2.2,
}

export interface PlayerProp {
  id: string
  eventId: string
  player: string
  stat: StatKey
  /** The posted line (e.g. 27.5 points). */
  line: number
  /** The model's projection (mean) for the stat. */
  projection: number
  /** Stat spread; defaults to DEFAULT_STAT_SD[stat]. */
  sd?: number
}

function sdOf(prop: PlayerProp): number {
  return prop.sd ?? DEFAULT_STAT_SD[prop.stat]
}

/** The fair probability the OVER cashes for a prop. */
export function propOverProbability(prop: PlayerProp): number {
  return overProbability(prop.projection, sdOf(prop), prop.line)
}

/** Price a player prop's over/under off its projection + stat spread. */
export function pricePlayerProp(prop: PlayerProp, targetMargin = 0.06): PricedLine {
  return priceLine(prop.projection, sdOf(prop), prop.line, targetMargin)
}

/** Grade a player prop against the actual stat value. */
export function gradePlayerProp(prop: PlayerProp, actual: number, pick: OverUnder): 'win' | 'loss' | 'push' {
  return gradeOverUnder(prop.line, pick, actual)
}

/** A small sample prop slate (projections illustrative). */
export const SAMPLE_PROPS: PlayerProp[] = [
  { id: 'p1', eventId: 'nba-1', player: 'Luka Dončić', stat: 'points', line: 32.5, projection: 33.4 },
  { id: 'p2', eventId: 'nba-1', player: 'Luka Dončić', stat: 'pra', line: 49.5, projection: 50.8 },
  { id: 'p3', eventId: 'nba-1', player: 'Anthony Davis', stat: 'rebounds', line: 11.5, projection: 11.2 },
  { id: 'p4', eventId: 'nfl-1', player: 'Patrick Mahomes', stat: 'passing_yards', line: 274.5, projection: 281 },
]
