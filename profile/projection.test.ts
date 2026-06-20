/**
 * The pure projection: windowing (7d/30d/season/all) across a time/settlement boundary,
 * deterministic drop+rebuild, no-inflation (Σ by-sport == all net == Σ row profit), units/ROI.
 */
import { describe, it, expect } from 'vitest'
import type { BetRow } from '../app/ledger-stats.js'
import { projectWindow, projectPlayer, UNIT_CENTS } from './projection.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_750_000_000_000

// Helper to build a settled row. profit signed cents; outcome inferred from profit unless given.
let seq = 0
function row(over: Partial<BetRow> & { time: number; profit: number; stake?: number }): BetRow {
  seq += 1
  const outcome = over.outcome ?? (over.profit > 0 ? 'win' : over.profit < 0 ? 'loss' : 'push')
  return {
    id: seq,
    accountId: 'p1',
    gameKey: over.gameKey ?? 'sportsbook',
    game: over.game ?? 'Bet',
    stake: over.stake ?? 1000,
    multiplier: over.multiplier ?? (outcome === 'win' ? 2 : 0),
    profit: over.profit,
    outcome,
    time: over.time,
  }
}

const rows: BetRow[] = [
  row({ time: NOW - 40 * DAY, profit: 5000, stake: 5000, gameKey: 'sportsbook' }),
  row({ time: NOW - 20 * DAY, profit: -3000, stake: 3000, gameKey: 'sportsbook' }),
  row({ time: NOW - 3 * DAY, profit: 2000, stake: 2000, gameKey: 'mines' }),
  row({ time: NOW - 1 * DAY, profit: 1000, stake: 1000, gameKey: 'mines' }),
]
const NET = 5000 - 3000 + 2000 + 1000 // 5000

describe('windows compute correctly', () => {
  const season = NOW - 30 * DAY
  it('7d / 30d / season / all select the right settled rows', () => {
    expect(projectWindow('p1', rows, [], '7d', NOW, season).wagers).toBe(2) // -3d, -1d
    expect(projectWindow('p1', rows, [], '30d', NOW, season).wagers).toBe(3) // -20d, -3d, -1d
    expect(projectWindow('p1', rows, [], 'season', NOW, season).wagers).toBe(3) // >= -30d
    expect(projectWindow('p1', rows, [], 'all', NOW, season).wagers).toBe(4)
  })

  it('windows shift across a boundary (time advances ~ a settlement later)', () => {
    const later = NOW + 25 * DAY // 25 days on
    expect(projectWindow('p1', rows, [], '7d', later, season).wagers).toBe(0) // nothing in the last 7d
    expect(projectWindow('p1', rows, [], '30d', later, season).wagers).toBe(2) // only -3d, -1d remain within 30d
    expect(projectWindow('p1', rows, [], 'all', later, season).wagers).toBe(4) // lifetime unchanged
    // a new season anchored at `later` excludes everything before it
    expect(projectWindow('p1', rows, [], 'season', later, later).wagers).toBe(0)
  })
})

describe('no inflation — the projection reconciles to its rows', () => {
  it('all-window net == Σ row profit, and Σ by-sport net == all net', () => {
    const all = projectWindow('p1', rows, [], 'all', NOW, NOW - 30 * DAY)
    expect(all.netCents).toBe(NET)
    const bySportNet = Object.values(all.bySport).reduce((a, s) => a + s.netCents, 0)
    expect(bySportNet).toBe(all.netCents)
    const byMarketNet = Object.values(all.byMarket).reduce((a, s) => a + s.netCents, 0)
    expect(byMarketNet).toBe(all.netCents)
  })

  it('by_sport keys on game, by_market on side of house', () => {
    const all = projectWindow('p1', rows, [], 'all', NOW, NOW - 30 * DAY)
    expect(Object.keys(all.bySport).sort()).toEqual(['mines', 'sportsbook'])
    expect(Object.keys(all.byMarket).sort()).toEqual(['casino', 'sportsbook'])
  })
})

describe('derived columns', () => {
  it('units = net / UNIT_CENTS; roi_bps = net/wagered', () => {
    const all = projectWindow('p1', rows, [], 'all', NOW, NOW - 30 * DAY)
    expect(all.units).toBe(Math.round((NET / UNIT_CENTS) * 100) / 100)
    const wagered = 5000 + 3000 + 2000 + 1000
    expect(all.roiBps).toBe(Math.round((NET / wagered) * 10000))
  })

  it('current_streak is signed (+win run / −loss run); longest is the win run', () => {
    // chronological: +5000(W), −3000(L), +2000(W), +1000(W) → trailing 2-win run
    const all = projectWindow('p1', rows, [], 'all', NOW, NOW - 30 * DAY)
    expect(all.currentStreak).toBe(2)
    expect(all.longestStreak).toBe(2)
  })
})

describe('deterministic drop + rebuild', () => {
  it('projecting the same rows twice yields identical blocks', () => {
    const a = projectPlayer('p1', rows, [], NOW, NOW - 30 * DAY)
    const b = projectPlayer('p1', rows, [], NOW, NOW - 30 * DAY)
    expect(a).toEqual(b)
  })
})
