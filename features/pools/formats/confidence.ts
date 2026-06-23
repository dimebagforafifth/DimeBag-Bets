/**
 * Confidence — pick a side AND assign each game a unique confidence weight (1..N). Score =
 * sum of the confidence weights on correct picks. Pure plugin.
 */

import { rankByPoints, winnersBySplit, type ScoredRow } from './shared.js'
import type {
  ConfidenceConfig,
  ConfidencePicks,
  ConfidenceResults,
  FormatScoreInput,
  FormatStanding,
  FormatWinner,
  PoolConfig,
  PoolFormat,
  PoolPicks,
} from './types.js'

function asConfig(config: PoolConfig): ConfidenceConfig {
  if (config.kind !== 'confidence') throw new Error('confidence: wrong config kind')
  return config
}

function score(
  picks: ConfidencePicks,
  results: ConfidenceResults,
  config: ConfidenceConfig,
): number {
  let pts = 0
  const n = config.games.length
  for (const g of config.games) {
    const won = results.winners[g.id]
    if (won && won !== 'void' && picks.selections[g.id] === won) {
      // Defensively clamp to a legal 1..N weight so a tampered/corrupt persisted pick can't inflate
      // a score past the honest permutation maximum (picks are validated at entry; this self-defends).
      const w = picks.confidence[g.id]
      if (Number.isInteger(w) && w >= 1 && w <= n) pts += w
    }
  }
  return pts
}

function rows(input: FormatScoreInput): ScoredRow[] {
  const config = asConfig(input.config)
  const results =
    input.results.kind === 'confidence'
      ? input.results
      : { kind: 'confidence' as const, winners: {} }
  return input.entries.map((e) => ({
    accountId: e.accountId,
    name: e.name,
    points: e.picks.kind === 'confidence' ? score(e.picks, results, config) : 0,
  }))
}

export const confidenceFormat: PoolFormat = {
  kind: 'confidence',
  label: 'Confidence',
  defaultConfig: (): PoolConfig => ({
    kind: 'confidence',
    games: [
      { id: 'g1', label: 'Game 1', options: ['Home', 'Away'] },
      { id: 'g2', label: 'Game 2', options: ['Home', 'Away'] },
      { id: 'g3', label: 'Game 3', options: ['Home', 'Away'] },
    ],
  }),

  validateConfig(config: PoolConfig): void {
    const c = asConfig(config)
    if (c.games.length === 0) throw new Error('confidence needs at least one game')
    const ids = new Set<string>()
    for (const g of c.games) {
      if (!g.id || ids.has(g.id)) throw new Error('confidence game ids must be present and unique')
      ids.add(g.id)
      if (g.options.length !== 2) throw new Error('confidence games are two-sided')
    }
  },

  validatePicks(picks: PoolPicks, config: PoolConfig): void {
    const c = asConfig(config)
    if (picks.kind !== 'confidence') throw new Error('confidence: wrong picks kind')
    const n = c.games.length
    // every game must carry a side AND a confidence weight, and the weights must be a permutation
    // of 1..N (each rank used exactly once) — the defining rule of a confidence pool.
    const used = new Set<number>()
    for (const g of c.games) {
      const sel = picks.selections[g.id]
      if (sel === undefined) throw new Error('confidence requires a pick for every game')
      if (!g.options.includes(sel)) throw new Error(`invalid pick for ${g.label}`)
      const w = picks.confidence[g.id]
      if (!Number.isInteger(w) || w < 1 || w > n)
        throw new Error(`confidence weight for ${g.label} must be 1..${n}`)
      if (used.has(w)) throw new Error('each confidence weight 1..N must be used exactly once')
      used.add(w)
    }
  },

  standings(input: FormatScoreInput): FormatStanding[] {
    return rankByPoints(rows(input))
  },

  winners(input: FormatScoreInput): FormatWinner[] {
    return winnersBySplit(rankByPoints(rows(input)), input.prizeSplit)
  },
}
