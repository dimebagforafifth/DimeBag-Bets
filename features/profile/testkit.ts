/**
 * Test helpers — fabricate ProfileStats + a fake projection source so the surfaces can be tested
 * against KNOWN values (decoupled from the records seed). Not a test file itself; imported by the
 * profile/*.test.* files. Pure data; no money, no stores.
 */

import type {
  PeriodStats,
  ProfileStats,
  ProfileProjectionSource,
  ProfileSplit,
  RankProgress,
} from './projection.js'

const UNRANKED: RankProgress = {
  current: {
    id: 'none',
    name: 'Unranked',
    color: '#888888',
    minWagered: 0,
    freePlayReward: 0,
    perks: [],
  },
  next: null,
  pct: 1,
  remaining: 0,
}

export function ps(o: Partial<PeriodStats> = {}): PeriodStats {
  return {
    bets: 0,
    wagered: 0,
    net: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    decided: 0,
    winRate: 0,
    roi: 0,
    ...o,
  }
}

export interface MkStatsOpts {
  name?: string
  lifetime?: Partial<PeriodStats>
  day?: Partial<PeriodStats>
  week?: Partial<PeriodStats>
  month?: Partial<PeriodStats>
  units?: number
  pnl?: { time: number; cumulative: number }[]
  bySport?: ProfileSplit[]
  byMarket?: ProfileSplit[]
  byGame?: ProfileSplit[]
  biggestWinProfit?: number
}

export function mkStats(id: string, o: MkStatsOpts = {}): ProfileStats {
  const lifetime = ps(o.lifetime)
  return {
    accountId: id,
    name: o.name ?? id,
    lifetime,
    periods: { day: ps(o.day), week: ps(o.week), month: ps(o.month) },
    units: o.units ?? 0,
    netCents: lifetime.net,
    biggestWin:
      o.biggestWinProfit != null
        ? {
            id: 1,
            gameKey: 'sportsbook',
            game: 'Bet',
            stake: 1000,
            multiplier: 2,
            profit: o.biggestWinProfit,
            outcome: 'win',
            time: 0,
          }
        : null,
    streak: { current: 0, currentKind: 'none', longestWin: 0, longestLoss: 0 },
    pnl: o.pnl ?? [],
    bySport: o.bySport ?? [],
    byMarket: o.byMarket ?? [],
    byGame: o.byGame ?? [],
    clv: { available: false, sampleSize: 0, beatRate: 0, avgClvPct: 0, note: 'n/a' },
    tailSuccess: { available: false, tails: 0, settled: 0, wins: 0, successRate: 0, note: 'n/a' },
    tier: UNRANKED,
    badges: [],
    demoSeeded: false,
  }
}

/** A projection source over a fixed map of stats (unknown ids fall back to an empty profile). */
export function fakeSource(map: Record<string, ProfileStats>): ProfileProjectionSource {
  return {
    statsFor: (id) => map[id] ?? mkStats(id),
    listProfiles: () => Object.keys(map).map((id) => ({ id, name: map[id].name })),
  }
}

export function split(
  key: string,
  label: string,
  net: number,
  bets = 1,
  winRate = 50,
): ProfileSplit {
  return { key, label, bets, wagered: Math.max(1000, Math.abs(net)), net, roi: 0.1, winRate }
}
