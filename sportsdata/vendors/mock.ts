/**
 * MockProvider (CLAUDE.md §4, §6) — a realistic, seeded `OddsFeedProvider` for dev/demo
 * with no network and no API key. It returns hand-authored `ApiEvent` DTOs (the VENDOR
 * shape, not the internal model) so it exercises the real normalization path
 * (`sportsdata/map`) end to end — upcoming games with full moneyline/spread/total
 * pricing, one in-play game with a running score, and one finished game with an official
 * score so grading fires. Drop it in anywhere an `OddsFeedProvider` is expected.
 */

import type { ApiEvent } from '../types.js'
import { makeProvider, type OddsFeedProvider } from './provider.js'

/** A compact builder for a seeded vendor event with the three core markets. */
function ev(e: {
  id: string
  sportKey: string
  league: string
  home: string
  away: string
  commence: string
  mlHome: number
  mlAway: number
  spread: number // home handicap
  total: number
  status?: ApiEvent['status']
  homeScore?: number
  awayScore?: number
  completed?: boolean
}): ApiEvent {
  const scores =
    e.homeScore != null && e.awayScore != null
      ? [
          { name: e.home, score: e.homeScore },
          { name: e.away, score: e.awayScore },
        ]
      : null
  return {
    id: e.id,
    sport_key: e.sportKey,
    sport_title: e.league,
    home_team: e.home,
    away_team: e.away,
    commence_time: e.commence,
    status: e.status,
    completed: e.completed,
    official: e.completed ? true : undefined,
    scores,
    bookmakers: [
      {
        key: 'mock',
        markets: [
          { key: 'h2h', outcomes: [{ name: e.home, price: e.mlHome }, { name: e.away, price: e.mlAway }] },
          {
            key: 'spreads',
            outcomes: [
              { name: e.home, price: -110, point: e.spread },
              { name: e.away, price: -110, point: -e.spread },
            ],
          },
          {
            key: 'totals',
            outcomes: [
              { name: 'Over', price: -110, point: e.total },
              { name: 'Under', price: -110, point: e.total },
            ],
          },
        ],
      },
    ],
  }
}

/** A realistic seeded slate spanning the lifecycle (upcoming → live → final). */
export const MOCK_SLATE: ApiEvent[] = [
  ev({
    id: 'mock-nba-lal-bos',
    sportKey: 'basketball_nba',
    league: 'NBA',
    home: 'Lakers',
    away: 'Celtics',
    commence: '2026-06-12T23:30:00Z',
    mlHome: -135,
    mlAway: +115,
    spread: -3.5,
    total: 224.5,
    status: 'upcoming',
  }),
  ev({
    id: 'mock-nfl-kc-buf',
    sportKey: 'americanfootball_nfl',
    league: 'NFL',
    home: 'Chiefs',
    away: 'Bills',
    commence: '2026-06-13T20:25:00Z',
    mlHome: -118,
    mlAway: -102,
    spread: -1.5,
    total: 48.5,
    status: 'upcoming',
  }),
  ev({
    id: 'mock-nba-gsw-den',
    sportKey: 'basketball_nba',
    league: 'NBA',
    home: 'Warriors',
    away: 'Nuggets',
    commence: '2026-06-12T02:00:00Z',
    mlHome: +120,
    mlAway: -140,
    spread: +2.5,
    total: 231.5,
    status: 'live',
    homeScore: 58,
    awayScore: 62,
  }),
  ev({
    id: 'mock-epl-ars-mci',
    sportKey: 'soccer_epl',
    league: 'EPL',
    home: 'Arsenal',
    away: 'Man City',
    commence: '2026-06-11T16:30:00Z',
    mlHome: +180,
    mlAway: +150,
    spread: +0.5,
    total: 2.5,
    status: 'final',
    homeScore: 2,
    awayScore: 1,
    completed: true,
  }),
]

export interface MockProviderOptions {
  /** Override the seeded slate (e.g. a test fixture). */
  slate?: ApiEvent[]
}

export function createMockProvider(opts: MockProviderOptions = {}): OddsFeedProvider {
  const slate = opts.slate ?? MOCK_SLATE
  // Copy on read so a consumer can't mutate the shared seed.
  return makeProvider({
    name: 'mock',
    fetchOdds: async () => slate.map((e) => ({ ...e })),
  })
}
