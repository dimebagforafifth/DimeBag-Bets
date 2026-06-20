/**
 * Pick'em — pick a side in each binary matchup; score = number correct. Pure plugin.
 */

import { rankByPoints, winnersBySplit, type ScoredRow } from './shared.js'
import type {
  FormatScoreInput,
  FormatStanding,
  FormatWinner,
  PickemConfig,
  PickemPicks,
  PickemResults,
  PoolConfig,
  PoolFormat,
  PoolPicks,
} from './types.js'

function asConfig(config: PoolConfig): PickemConfig {
  if (config.kind !== 'pickem') throw new Error('pickem: wrong config kind')
  return config
}

function correctCount(picks: PickemPicks, results: PickemResults, config: PickemConfig): number {
  let n = 0
  for (const g of config.games) {
    const won = results.winners[g.id]
    if (won && won !== 'void' && picks.selections[g.id] === won) n += 1
  }
  return n
}

function rows(input: FormatScoreInput): ScoredRow[] {
  const config = asConfig(input.config)
  const results =
    input.results.kind === 'pickem' ? input.results : { kind: 'pickem' as const, winners: {} }
  return input.entries.map((e) => ({
    accountId: e.accountId,
    name: e.name,
    points: e.picks.kind === 'pickem' ? correctCount(e.picks, results, config) : 0,
  }))
}

export const pickemFormat: PoolFormat = {
  kind: 'pickem',
  label: "Pick'em",
  defaultConfig: (): PoolConfig => ({
    kind: 'pickem',
    games: [
      { id: 'g1', label: 'Game 1', options: ['Home', 'Away'] },
      { id: 'g2', label: 'Game 2', options: ['Home', 'Away'] },
      { id: 'g3', label: 'Game 3', options: ['Home', 'Away'] },
    ],
  }),

  validateConfig(config: PoolConfig): void {
    const c = asConfig(config)
    if (c.games.length === 0) throw new Error("pick'em needs at least one game")
    const ids = new Set<string>()
    for (const g of c.games) {
      if (!g.id || ids.has(g.id)) throw new Error('pick’em game ids must be present and unique')
      ids.add(g.id)
      if (g.options.length !== 2) throw new Error('pick’em games are two-sided')
    }
  },

  validatePicks(picks: PoolPicks, config: PoolConfig): void {
    const c = asConfig(config)
    if (picks.kind !== 'pickem') throw new Error('pickem: wrong picks kind')
    for (const g of c.games) {
      const sel = picks.selections[g.id]
      if (sel === undefined) continue // partial picks allowed; unpicked games just score 0
      if (!g.options.includes(sel)) throw new Error(`invalid pick for ${g.label}`)
    }
  },

  standings(input: FormatScoreInput): FormatStanding[] {
    return rankByPoints(rows(input))
  },

  winners(input: FormatScoreInput): FormatWinner[] {
    return winnersBySplit(rankByPoints(rows(input)), input.prizeSplit)
  },
}
