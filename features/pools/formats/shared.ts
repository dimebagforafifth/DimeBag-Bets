/**
 * Shared pure helpers for the leaderboard-style formats (pick'em / confidence / bracket).
 * No money — ranking + prize-weight math only.
 */

import type { FormatStanding, FormatWinner } from './types.js'

const cmpId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export interface ScoredRow {
  accountId: string
  name: string
  points: number
  note?: string
}

/** Rank rows by points desc with a stable, locale-independent tiebreak (points, name, id). */
export function rankByPoints(rows: ScoredRow[]): FormatStanding[] {
  return rows
    .slice()
    .sort(
      (a, b) =>
        b.points - a.points || a.name.localeCompare(b.name) || cmpId(a.accountId, b.accountId),
    )
    .map((r, i) => ({
      accountId: r.accountId,
      name: r.name,
      points: r.points,
      rank: i + 1,
      note: r.note,
    }))
}

/**
 * Map ranked standings to prize-weight winners by a rank split. Tied entrants (equal points)
 * share the COMBINED weight of the rank slots they span, split evenly — so a 2-way tie for 1st
 * in a [0.7, 0.3] pool gives each 0.5, never one 0.7 and one 0.3. Σ weights ≤ Σ split.
 */
export function winnersBySplit(standings: FormatStanding[], split: number[]): FormatWinner[] {
  const winners: FormatWinner[] = []
  let i = 0
  while (i < standings.length) {
    let j = i
    while (j + 1 < standings.length && standings[j + 1].points === standings[i].points) j += 1
    const groupSize = j - i + 1
    let combined = 0
    for (let k = i; k <= j; k += 1) combined += split[k] ?? 0
    if (combined > 0) {
      const share = combined / groupSize
      for (let k = i; k <= j; k += 1)
        winners.push({ accountId: standings[k].accountId, weight: share })
    }
    i = j + 1
  }
  return winners.filter((w) => w.weight > 0)
}
