/**
 * Survivor — each round pick ONE team to win; you may never reuse a team; the first time your
 * pick loses you're eliminated. The last entrant standing wins; if several survive equally long
 * they split. Pure plugin.
 */

import type {
  FormatScoreInput,
  FormatStanding,
  FormatWinner,
  PoolConfig,
  PoolFormat,
  PoolPicks,
  SurvivorConfig,
  SurvivorPicks,
  SurvivorResults,
} from './types.js'

function asConfig(config: PoolConfig): SurvivorConfig {
  if (config.kind !== 'survivor') throw new Error('survivor: wrong config kind')
  return config
}

/** How many consecutive scored rounds this entry survived, and the round it went out (or null). */
export function survival(
  picks: SurvivorPicks,
  results: SurvivorResults,
): { survived: number; eliminatedRound: number | null } {
  const scored = Object.keys(results.roundWinners)
    .map(Number)
    .sort((a, b) => a - b)
  let survived = 0
  for (const r of scored) {
    const team = picks.selections[r]
    const winners = results.roundWinners[r] ?? []
    if (team !== undefined && winners.includes(team)) survived += 1
    else return { survived, eliminatedRound: r }
  }
  return { survived, eliminatedRound: null }
}

function standingsRows(input: FormatScoreInput): FormatStanding[] {
  const results =
    input.results.kind === 'survivor'
      ? input.results
      : { kind: 'survivor' as const, roundWinners: {} }
  const rows = input.entries.map((e) => {
    const s =
      e.picks.kind === 'survivor' ? survival(e.picks, results) : { survived: 0, eliminatedRound: 0 }
    return {
      accountId: e.accountId,
      name: e.name,
      points: s.survived,
      note: s.eliminatedRound === null ? 'alive' : `out R${s.eliminatedRound + 1}`,
    }
  })
  return rows
    .slice()
    .sort(
      (a, b) =>
        b.points - a.points || a.name.localeCompare(b.name) || (a.accountId < b.accountId ? -1 : 1),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

export const survivorFormat: PoolFormat = {
  kind: 'survivor',
  label: 'Survivor',
  defaultConfig: (): PoolConfig => ({
    kind: 'survivor',
    teams: ['Team A', 'Team B', 'Team C', 'Team D'],
    rounds: 3,
  }),

  validateConfig(config: PoolConfig): void {
    const c = asConfig(config)
    if (c.teams.length < 2) throw new Error('survivor needs at least two teams')
    if (!Number.isInteger(c.rounds) || c.rounds < 1)
      throw new Error('survivor needs at least one round')
    if (new Set(c.teams).size !== c.teams.length)
      throw new Error('survivor team names must be unique')
  },

  validatePicks(picks: PoolPicks, config: PoolConfig): void {
    const c = asConfig(config)
    if (picks.kind !== 'survivor') throw new Error('survivor: wrong picks kind')
    const used = new Set<string>()
    for (const [round, team] of Object.entries(picks.selections)) {
      if (!c.teams.includes(team)) throw new Error(`unknown team "${team}"`)
      // THE survivor rule: a team can be used at most once across all of an entry's rounds.
      if (used.has(team))
        throw new Error(`team "${team}" was already used — survivor picks can't repeat`)
      used.add(team)
      const r = Number(round)
      if (!Number.isInteger(r) || r < 0 || r >= c.rounds)
        throw new Error(`round ${round} is out of range`)
    }
  },

  standings(input: FormatScoreInput): FormatStanding[] {
    return standingsRows(input)
  },

  winners(input: FormatScoreInput): FormatWinner[] {
    const standings = standingsRows(input)
    if (standings.length === 0) return []
    // Last standing = the entrants who survived the most rounds; they split evenly (tie split).
    const best = standings[0].points
    // If NOBODY survived a single round, there is no winner — the pot falls to the rake (or the
    // operator voids to refund). Paying busted entrants would reward losing every pick.
    if (best <= 0) return []
    const survivors = standings.filter((s) => s.points === best)
    const share = 1 / survivors.length
    return survivors.map((s) => ({ accountId: s.accountId, weight: share }))
  },
}
