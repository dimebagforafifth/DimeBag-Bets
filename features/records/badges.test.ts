import { describe, expect, it } from 'vitest'
import { deriveBadges } from './badges.js'
import type { PeriodStats, VerifiedRecord } from './types.js'

const ZERO: PeriodStats = {
  bets: 0,
  wagered: 0,
  net: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
  decided: 0,
  winRate: 0,
  roi: 0,
}

function rec(over: Partial<VerifiedRecord> = {}): VerifiedRecord {
  return {
    accountId: 'p',
    name: 'T',
    lifetime: { ...ZERO },
    periods: { day: { ...ZERO }, week: { ...ZERO }, month: { ...ZERO } },
    streak: { current: 0, currentKind: 'none', longestWin: 0, longestLoss: 0 },
    biggestWin: null,
    biggestLoss: null,
    byGame: [],
    side: { casino: { ...ZERO }, sportsbook: { ...ZERO } },
    clv: { available: false, sampleSize: 0, beatRate: 0, avgClvPct: 0 },
    tier: {
      current: {
        id: 'none',
        name: 'Unranked',
        color: '#777',
        minWagered: 0,
        freePlayReward: 0,
        perks: [],
      },
      next: null,
      pct: 0,
      remaining: 0,
    },
    badges: [],
    recentBets: [],
    integrity: {
      source: 'settled-ledger',
      entriesConsidered: 0,
      demoSeeded: false,
      fingerprint: 'x',
    },
    ...over,
  }
}
const ids = (r: VerifiedRecord) => deriveBadges(r).map((b) => b.id)

describe('deriveBadges — every badge is earned from the record', () => {
  it('awards nothing for an empty/unranked record', () => {
    expect(deriveBadges(rec())).toEqual([])
  })

  it('tier + high-roller from verified lifetime wagered', () => {
    const r = rec({
      lifetime: { ...ZERO, wagered: 6_000_000, bets: 40 },
      tier: {
        current: {
          id: 'gold',
          name: 'Gold',
          color: '#d6b14a',
          minWagered: 5_000_000,
          freePlayReward: 0,
          perks: [],
        },
        next: null,
        pct: 1,
        remaining: 0,
      },
    })
    expect(ids(r)).toEqual(expect.arrayContaining(['tier-gold', 'high-roller']))
  })

  it('hot-streak only for a live win streak ≥ 3', () => {
    expect(
      ids(rec({ streak: { current: 3, currentKind: 'win', longestWin: 3, longestLoss: 0 } })),
    ).toContain('hot-streak')
    expect(
      ids(rec({ streak: { current: 3, currentKind: 'loss', longestWin: 0, longestLoss: 3 } })),
    ).not.toContain('hot-streak')
  })

  it('centurion at 100 bets, iron-run at a 5-win best, big-hit at 10×', () => {
    expect(ids(rec({ lifetime: { ...ZERO, bets: 100 } }))).toContain('centurion')
    expect(
      ids(rec({ streak: { current: 0, currentKind: 'none', longestWin: 5, longestLoss: 0 } })),
    ).toContain('iron-run')
    expect(
      ids(
        rec({
          biggestWin: {
            id: 1,
            gameKey: 'crash',
            game: 'Crash',
            stake: 100,
            multiplier: 12,
            profit: 1100,
            outcome: 'win',
            time: 0,
          },
        }),
      ),
    ).toContain('big-hit')
  })

  it('sharp only with enough priced CLV beating the close', () => {
    expect(
      ids(rec({ clv: { available: true, sampleSize: 20, beatRate: 60, avgClvPct: 3 } })),
    ).toContain('sharp')
    expect(
      ids(rec({ clv: { available: true, sampleSize: 5, beatRate: 80, avgClvPct: 3 } })),
    ).not.toContain('sharp')
  })

  it('in-profit needs real positive ROI — a losing record can NOT earn it (no inflation)', () => {
    expect(ids(rec({ lifetime: { ...ZERO, roi: 0.05, decided: 30, net: 5000 } }))).toContain(
      'in-profit',
    )
    expect(ids(rec({ lifetime: { ...ZERO, roi: -0.2, decided: 80, net: -9000 } }))).not.toContain(
      'in-profit',
    )
  })
})
