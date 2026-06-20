/**
 * Head-to-head — a pure read-model that puts two players' projections side by side over a chosen
 * window and marks the leader on each metric. It reads two `ProfileStats` and computes nothing
 * but comparisons: no store, no money, no mutation. The numbers are exactly each player's own
 * projection, so an H2H row always reconciles to that player's individual profile.
 */

import { statsForWindow, type ProfileStats, type StatsWindow } from './projection.js'

export type H2HLeader = 'a' | 'b' | 'tie'

/** One compared metric: each side's value + who leads. */
export interface H2HRow {
  key: string
  label: string
  /** Formatting hint for the surface. */
  format: 'money' | 'percent' | 'number' | 'record'
  a: number
  b: number
  /** For a 'record' row, the W–L text per side (value carries wins for tie-breaking only). */
  aText?: string
  bText?: string
  leader: H2HLeader
  /** True when a higher number is better (most metrics); false if lower is better. */
  higherWins: boolean
}

export interface HeadToHead {
  window: StatsWindow
  a: { id: string; name: string }
  b: { id: string; name: string }
  rows: H2HRow[]
  /** Count of metric rows each side leads (ties excluded) — the headline scoreline. */
  score: { a: number; b: number; ties: number }
}

function leaderOf(a: number, b: number, higherWins: boolean): H2HLeader {
  if (a === b) return 'tie'
  const aWins = higherWins ? a > b : a < b
  return aWins ? 'a' : 'b'
}

/**
 * Compare two players over `window`. Metrics: net, ROI, win rate, units, bets, record (W–L), and
 * the best single win. Units is a lifetime figure on the projection, so it's compared at lifetime
 * regardless of the window (labelled as such by the surface).
 */
export function compareHeadToHead(
  a: ProfileStats,
  b: ProfileStats,
  window: StatsWindow,
): HeadToHead {
  const pa = statsForWindow(a, window)
  const pb = statsForWindow(b, window)

  const rows: H2HRow[] = [
    {
      key: 'net',
      label: 'Net',
      format: 'money',
      a: pa.net,
      b: pb.net,
      higherWins: true,
      leader: leaderOf(pa.net, pb.net, true),
    },
    {
      key: 'roi',
      label: 'ROI',
      format: 'percent',
      a: pa.roi,
      b: pb.roi,
      higherWins: true,
      leader: leaderOf(pa.roi, pb.roi, true),
    },
    {
      key: 'winRate',
      label: 'Win rate',
      format: 'percent',
      a: pa.winRate / 100,
      b: pb.winRate / 100,
      higherWins: true,
      leader: leaderOf(pa.winRate, pb.winRate, true),
    },
    {
      key: 'units',
      label: 'Units (lifetime)',
      format: 'number',
      a: a.units,
      b: b.units,
      higherWins: true,
      leader: leaderOf(a.units, b.units, true),
    },
    {
      key: 'record',
      label: 'Record',
      format: 'record',
      a: pa.wins,
      b: pb.wins,
      aText: `${pa.wins}–${pa.losses}`,
      bText: `${pb.wins}–${pb.losses}`,
      higherWins: true,
      // More wins leads; on equal wins, fewer losses leads.
      leader:
        pa.wins === pb.wins
          ? leaderOf(pa.losses, pb.losses, false)
          : leaderOf(pa.wins, pb.wins, true),
    },
    {
      key: 'bets',
      label: 'Bets',
      format: 'number',
      a: pa.bets,
      b: pb.bets,
      higherWins: true,
      leader: leaderOf(pa.bets, pb.bets, true),
    },
    {
      key: 'biggestWin',
      label: 'Biggest win',
      format: 'money',
      a: a.biggestWin?.profit ?? 0,
      b: b.biggestWin?.profit ?? 0,
      higherWins: true,
      leader: leaderOf(a.biggestWin?.profit ?? 0, b.biggestWin?.profit ?? 0, true),
    },
  ]

  const score = rows.reduce(
    (acc, r) => {
      if (r.leader === 'a') acc.a += 1
      else if (r.leader === 'b') acc.b += 1
      else acc.ties += 1
      return acc
    },
    { a: 0, b: 0, ties: 0 },
  )

  return {
    window,
    a: { id: a.accountId, name: a.name },
    b: { id: b.accountId, name: b.name },
    rows,
    score,
  }
}
