/**
 * A mock slate matching the SGO odds contract EXACTLY (lib/odds/contract.ts), so
 * every book screen renders populated before the real feed lands. The Big 6 US/EU
 * leagues + one live game, each with moneyline / spread / total / player-prop /
 * alternate-line markets.
 *
 *  // SEAM: the FEED lane (Agent 1) replaces this as the data source by populating
 *  the Supabase cache tables (odds_events/odds_markets/odds_selections). The book
 *  UI reads through `useBookOdds()` (app/book/odds-source.ts) and never imports the
 *  feed directly, so the flip from mock → live is a one-line source swap.
 *
 * priceDisplay is the raw price after a representative house margin (the feed lane
 * owns real pricing); the UI ALWAYS shows priceDisplay. Points only — these are
 * prices, not money.
 */

import type {
  NormalizedEvent,
  NormalizedMarket,
  Price,
  Selection,
} from '../../lib/odds/contract.js'
import { decimalFromAmerican, americanFromDecimal } from './odds-format.js'

/** Representative house hold applied to raw prices to derive priceDisplay. The feed
 *  lane owns the real margin/override pipeline; this just makes the seam visible. */
const HOUSE_MARGIN = 0.045

const round3 = (n: number) => Math.round(n * 1000) / 1000

/** Build a {priceRaw, priceDisplay} pair from a raw American price by shading the
 *  profit portion of the decimal by the house margin (lower decimal = the hold). */
function shade(rawAmerican: number): { priceRaw: Price; priceDisplay: Price } {
  const rawDecimal = decimalFromAmerican(rawAmerican)
  const displayDecimal = 1 + (rawDecimal - 1) * (1 - HOUSE_MARGIN)
  return {
    priceRaw: { american: rawAmerican, decimal: round3(rawDecimal) },
    priceDisplay: {
      american: americanFromDecimal(displayDecimal),
      decimal: round3(displayDecimal),
    },
  }
}

let selSeq = 0
function sel(side: string, american: number, line?: number, available = true): Selection {
  selSeq += 1
  return {
    selectionId: `s${selSeq}`,
    side,
    ...(line === undefined ? {} : { line }),
    ...shade(american),
    bookmaker: 'consensus',
    available,
  }
}

interface EventSpec {
  eventId: string
  leagueId: string
  sport: string
  home: string
  away: string
  startsAt: string
  status?: 'pre' | 'live'
  mlHome: number
  mlAway: number
  spread: number // home handicap (negative = home favourite)
  total: number
  /** Add alternate spread/total ladders. */
  alts?: boolean
  /** Player props: [player, stat, line, overOdds, underOdds]. */
  props?: Array<[string, string, number, number, number]>
}

const STD = -110

function gameMarkets(e: EventSpec): NormalizedMarket[] {
  const markets: NormalizedMarket[] = [
    {
      marketId: `${e.eventId}-ml`,
      type: 'moneyline',
      period: 'game',
      selections: [sel('home', e.mlHome), sel('away', e.mlAway)],
    },
    {
      marketId: `${e.eventId}-sp`,
      type: 'spread',
      period: 'game',
      selections: [sel('home', STD, e.spread), sel('away', STD, -e.spread)],
    },
    {
      marketId: `${e.eventId}-tot`,
      type: 'total',
      period: 'game',
      statId: 'points',
      selections: [sel('over', STD, e.total), sel('under', STD, e.total)],
    },
  ]

  // Alternate lines: a short ladder either side of the main number. Same market
  // TYPE as the main line; the UI shows the first per (type,period) as the main and
  // any later same-type market as "alternate" (no extra contract fields needed).
  if (e.alts) {
    const altSpread: Selection[] = []
    for (const step of [-2, 2, 4]) {
      const line = e.spread + step
      // Further from the main number → cheaper one side, dearer the other (mirrored).
      altSpread.push(sel('home', STD - step * 18, line), sel('away', STD + step * 18, -line))
    }
    markets.push({
      marketId: `${e.eventId}-sp-alt`,
      type: 'spread',
      period: 'game',
      selections: altSpread,
    })

    const altTotal: Selection[] = []
    for (const step of [-4, 4]) {
      const line = e.total + step
      altTotal.push(sel('over', STD - step * 6, line), sel('under', STD + step * 6, line))
    }
    markets.push({
      marketId: `${e.eventId}-tot-alt`,
      type: 'total',
      period: 'game',
      statId: 'points',
      selections: altTotal,
    })
  }

  // Player props — each its own `prop` market with a player + stat.
  if (e.props) {
    e.props.forEach(([player, stat, line, over, under], i) => {
      markets.push({
        marketId: `${e.eventId}-prop-${i}`,
        type: 'prop',
        period: 'game',
        statId: stat,
        playerId: player,
        selections: [sel('over', over, line), sel('under', under, line)],
      })
    })
  }

  return markets
}

const SPECS: EventSpec[] = [
  {
    eventId: 'nba-lal-bos',
    leagueId: 'NBA',
    sport: 'Basketball',
    home: 'Lakers',
    away: 'Celtics',
    startsAt: '2026-06-15T23:30:00Z',
    status: 'live',
    mlHome: -135,
    mlAway: 115,
    spread: -3.5,
    total: 224.5,
    alts: true,
    props: [
      ['L. James', 'points', 27.5, -115, -105],
      ['J. Tatum', 'points', 28.5, -110, -110],
      ['A. Davis', 'rebounds', 11.5, +100, -120],
    ],
  },
  {
    eventId: 'nfl-kc-buf',
    leagueId: 'NFL',
    sport: 'Football',
    home: 'Chiefs',
    away: 'Bills',
    startsAt: '2026-06-21T20:25:00Z',
    mlHome: -118,
    mlAway: -102,
    spread: -1.5,
    total: 48.5,
    alts: true,
    props: [
      ['P. Mahomes', 'passing_yards', 274.5, -112, -108],
      ['J. Allen', 'passing_yards', 268.5, -110, -110],
    ],
  },
  {
    eventId: 'mlb-lad-nyy',
    leagueId: 'MLB',
    sport: 'Baseball',
    home: 'Dodgers',
    away: 'Yankees',
    startsAt: '2026-06-16T01:10:00Z',
    mlHome: -140,
    mlAway: 120,
    spread: -1.5,
    total: 8.5,
    alts: true,
  },
  {
    eventId: 'nhl-col-veg',
    leagueId: 'NHL',
    sport: 'Hockey',
    home: 'Avalanche',
    away: 'Golden Knights',
    startsAt: '2026-06-16T01:00:00Z',
    mlHome: -125,
    mlAway: 105,
    spread: -1.5,
    total: 6.5,
  },
  {
    eventId: 'epl-ars-mci',
    leagueId: 'EPL',
    sport: 'Soccer',
    home: 'Arsenal',
    away: 'Man City',
    startsAt: '2026-06-20T16:30:00Z',
    mlHome: 180,
    mlAway: 150,
    spread: 0.5,
    total: 2.5,
  },
  {
    eventId: 'ucl-rma-bay',
    leagueId: 'UCL',
    sport: 'Soccer',
    home: 'Real Madrid',
    away: 'Bayern Munich',
    startsAt: '2026-06-17T19:00:00Z',
    mlHome: 135,
    mlAway: 190,
    spread: -0.5,
    total: 3.5,
  },
]

/** Build a fresh copy of the mock slate (fresh selection ids each call so a test
 *  or a re-hydrate never shares mutable references). */
export function mockSlate(): NormalizedEvent[] {
  selSeq = 0
  return SPECS.map((e) => ({
    eventId: e.eventId,
    leagueId: e.leagueId,
    sport: e.sport,
    home: e.home,
    away: e.away,
    startsAt: e.startsAt,
    status: (e.status ?? 'pre') as NormalizedEvent['status'],
    markets: gameMarkets(e),
  }))
}

/** The Big-6 league ids on the mock slate, in board order. */
export const MOCK_LEAGUES = [...new Set(SPECS.map((s) => s.leagueId))]
