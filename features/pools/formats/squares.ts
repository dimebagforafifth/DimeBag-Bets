/**
 * Squares — a 10×10 grid where row = the home team's last score digit and col = the away
 * team's last digit. Each scoring period, the holder of square (home%10, away%10) wins that
 * period's share of the pool. An unheld winning square's share goes unpaid (→ rake). Pure plugin.
 */

import type {
  FormatScoreInput,
  FormatStanding,
  FormatWinner,
  PoolConfig,
  PoolFormat,
  PoolPicks,
  SquaresConfig,
  SquaresResults,
} from './types.js'

function asConfig(config: PoolConfig): SquaresConfig {
  if (config.kind !== 'squares') throw new Error('squares: wrong config kind')
  return config
}

const digit = (n: number): number => ((Math.trunc(n) % 10) + 10) % 10

/** The grid square that wins a given period's score: (home last digit, away last digit). */
export function winningSquare(score: { home: number; away: number }): { row: number; col: number } {
  return { row: digit(score.home), col: digit(score.away) }
}

/** Per-account { weight won, periods won } over the posted period scores. */
function tally(input: FormatScoreInput): Map<string, { weight: number; periods: number }> {
  const config = asConfig(input.config)
  const results: SquaresResults =
    input.results.kind === 'squares' ? input.results : { kind: 'squares', periodScores: [] }
  const out = new Map<string, { weight: number; periods: number }>()
  // De-dupe by period (last-write-wins) so a duplicate/corrected period score can't be counted
  // twice and push Σ weights past 1 (the store's mergeResults also keys by period; belt-and-braces).
  const byPeriod = new Map<number, { period: number; home: number; away: number }>()
  for (const ps of results.periodScores) byPeriod.set(ps.period, ps)
  for (const ps of byPeriod.values()) {
    const w = config.periodWeights[ps.period] ?? 0
    if (w <= 0) continue
    const sq = winningSquare(ps)
    const holder = input.entries.find(
      (e) =>
        e.picks.kind === 'squares' &&
        e.picks.squares.some((s) => s.row === sq.row && s.col === sq.col),
    )
    if (!holder) continue // unheld winning square — its share is undistributed (rake)
    const cur = out.get(holder.accountId) ?? { weight: 0, periods: 0 }
    out.set(holder.accountId, { weight: cur.weight + w, periods: cur.periods + 1 })
  }
  return out
}

export const squaresFormat: PoolFormat = {
  kind: 'squares',
  label: 'Squares',
  defaultConfig: (): PoolConfig => ({
    kind: 'squares',
    periods: ['Q1', 'Q2', 'Q3', 'Final'],
    periodWeights: [0.2, 0.2, 0.2, 0.4],
  }),

  validateConfig(config: PoolConfig): void {
    const c = asConfig(config)
    if (c.periods.length === 0) throw new Error('squares needs at least one scoring period')
    if (c.periodWeights.length !== c.periods.length)
      throw new Error('one weight per scoring period')
    const sum = c.periodWeights.reduce((a, b) => a + b, 0)
    if (c.periodWeights.some((w) => w < 0) || sum > 1 + 1e-9)
      throw new Error('period weights must be ≥ 0 and sum ≤ 1')
  },

  validatePicks(picks: PoolPicks, config: PoolConfig): void {
    asConfig(config)
    if (picks.kind !== 'squares') throw new Error('squares: wrong picks kind')
    if (picks.squares.length === 0) throw new Error('claim at least one square')
    const seen = new Set<string>()
    for (const s of picks.squares) {
      if (
        !Number.isInteger(s.row) ||
        s.row < 0 ||
        s.row > 9 ||
        !Number.isInteger(s.col) ||
        s.col < 0 ||
        s.col > 9
      ) {
        throw new Error('a square is row 0–9, col 0–9')
      }
      const key = `${s.row},${s.col}`
      if (seen.has(key)) throw new Error('the same square was claimed twice')
      seen.add(key)
    }
  },

  standings(input: FormatScoreInput): FormatStanding[] {
    const t = tally(input)
    return input.entries
      .map((e) => {
        const won = t.get(e.accountId) ?? { weight: 0, periods: 0 }
        const held = e.picks.kind === 'squares' ? e.picks.squares.length : 0
        return {
          accountId: e.accountId,
          name: e.name,
          points: won.periods,
          weight: won.weight,
          note: `${held} square${held === 1 ? '' : 's'}`,
        }
      })
      .sort(
        (a, b) =>
          b.weight - a.weight ||
          a.name.localeCompare(b.name) ||
          (a.accountId < b.accountId ? -1 : 1),
      )
      .map(({ weight: _weight, ...r }, i) => ({ ...r, rank: i + 1 }))
  },

  winners(input: FormatScoreInput): FormatWinner[] {
    return [...tally(input)].map(([accountId, { weight }]) => ({ accountId, weight }))
  },
}
