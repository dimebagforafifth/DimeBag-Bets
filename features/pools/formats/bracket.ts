/**
 * Bracket — pick the winner of every matchup; correct picks score per-round points, with an
 * upset bonus when the correctly-picked winner was the underdog (higher seed number). Pure.
 */

import { rankByPoints, winnersBySplit, type ScoredRow } from './shared.js'
import type {
  BracketConfig,
  BracketPicks,
  BracketResults,
  FormatScoreInput,
  FormatStanding,
  FormatWinner,
  PoolConfig,
  PoolFormat,
  PoolPicks,
} from './types.js'

function asConfig(config: PoolConfig): BracketConfig {
  if (config.kind !== 'bracket') throw new Error('bracket: wrong config kind')
  return config
}

function score(picks: BracketPicks, results: BracketResults, config: BracketConfig): number {
  let pts = 0
  for (const m of config.matchups) {
    const actual = results.winners[m.id]
    if (!actual) continue
    if (picks.winners[m.id] === actual) {
      pts += config.pointsPerRound[m.round] ?? 1
      // Upset bonus: the winner carried the WORSE seed (higher seed number = underdog).
      const winnerSeed = actual === m.teamA ? m.seedA : m.seedB
      const loserSeed = actual === m.teamA ? m.seedB : m.seedA
      if (winnerSeed > loserSeed) pts += config.upsetBonus
    }
  }
  return pts
}

function rows(input: FormatScoreInput): ScoredRow[] {
  const config = asConfig(input.config)
  const results =
    input.results.kind === 'bracket' ? input.results : { kind: 'bracket' as const, winners: {} }
  return input.entries.map((e) => ({
    accountId: e.accountId,
    name: e.name,
    points: e.picks.kind === 'bracket' ? score(e.picks, results, config) : 0,
  }))
}

export const bracketFormat: PoolFormat = {
  kind: 'bracket',
  label: 'Bracket',
  defaultConfig: (): PoolConfig => ({
    kind: 'bracket',
    matchups: [
      { id: 'm1', round: 0, teamA: 'Seed 1', seedA: 1, teamB: 'Seed 8', seedB: 8 },
      { id: 'm2', round: 0, teamA: 'Seed 4', seedA: 4, teamB: 'Seed 5', seedB: 5 },
      { id: 'm3', round: 1, teamA: 'Winner m1', seedA: 1, teamB: 'Winner m2', seedB: 4 },
    ],
    pointsPerRound: [1, 2, 4],
    upsetBonus: 1,
  }),

  validateConfig(config: PoolConfig): void {
    const c = asConfig(config)
    if (c.matchups.length === 0) throw new Error('a bracket needs at least one matchup')
    const ids = new Set<string>()
    for (const m of c.matchups) {
      if (!m.id || ids.has(m.id)) throw new Error('bracket matchup ids must be present and unique')
      ids.add(m.id)
      if (m.teamA === m.teamB) throw new Error('a matchup needs two distinct teams')
      if (!Number.isInteger(m.round) || m.round < 0)
        throw new Error('matchup round must be a non-negative integer')
    }
    if (!Number.isInteger(c.upsetBonus) || c.upsetBonus < 0)
      throw new Error('upset bonus must be ≥ 0')
  },

  validatePicks(picks: PoolPicks, config: PoolConfig): void {
    const c = asConfig(config)
    if (picks.kind !== 'bracket') throw new Error('bracket: wrong picks kind')
    for (const m of c.matchups) {
      const pick = picks.winners[m.id]
      if (pick === undefined) continue // partial brackets allowed; unpicked matchups score 0
      if (pick !== m.teamA && pick !== m.teamB) throw new Error(`invalid pick for matchup ${m.id}`)
    }
  },

  standings(input: FormatScoreInput): FormatStanding[] {
    return rankByPoints(rows(input))
  },

  winners(input: FormatScoreInput): FormatWinner[] {
    return winnersBySplit(rankByPoints(rows(input)), input.prizeSplit)
  },
}
