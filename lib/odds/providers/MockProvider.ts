/**
 * MockProvider — seeded NormalizedEvent[] so the app runs fully offline and we burn ZERO
 * SGO free-tier objects during routine dev. This is the DEFAULT provider (see poller.ts);
 * the real SGO feed is only switched on for deliberate live test runs.
 *
 * Coverage: the Big 6 (NFL, NBA, MLB, NHL, soccer/EPL, NCAA) + a UFC card, with moneyline
 * / spread / total markets, plus one game already LIVE (status:'live') so in-play UI has
 * something to render. Prices flow through the same pricing helpers as the real provider,
 * so priceRaw/priceDisplay are populated identically (display = raw × house margin).
 * Data is deterministic (fixed prices + ISO times) so tests are stable.
 */

import type {
  ListEventsOptions,
  NormalizedEvent,
  NormalizedMarket,
  OddsFeedProvider,
  Selection,
} from '../contract.js'
import { applyMargin, priceFromAmerican, DEFAULT_MARGIN } from '../pricing.js'

const BOOK = 'mock'

function sel(id: string, side: string, american: number, line?: number): Selection {
  const raw = priceFromAmerican(american)
  return {
    selectionId: line != null ? `${id}@${line}` : id,
    side,
    ...(line != null ? { line } : {}),
    priceRaw: raw,
    priceDisplay: applyMargin(raw, DEFAULT_MARGIN),
    bookmaker: BOOK,
    available: true,
  }
}

/** Build the standard three team markets (moneyline, spread, total) for an event. */
function teamMarkets(
  eventId: string,
  o: { mlHome: number; mlAway: number; spread: number; total: number },
): NormalizedMarket[] {
  return [
    {
      marketId: `${eventId}:moneyline:game`,
      type: 'moneyline',
      period: 'game',
      selections: [
        sel(`${eventId}-ml-home`, 'home', o.mlHome),
        sel(`${eventId}-ml-away`, 'away', o.mlAway),
      ],
    },
    {
      marketId: `${eventId}:spread:game`,
      type: 'spread',
      period: 'game',
      selections: [
        sel(`${eventId}-sp-home`, 'home', -110, o.spread),
        sel(`${eventId}-sp-away`, 'away', -110, -o.spread),
      ],
    },
    {
      marketId: `${eventId}:total:game`,
      type: 'total',
      period: 'game',
      selections: [
        sel(`${eventId}-ou-over`, 'over', -110, o.total),
        sel(`${eventId}-ou-under`, 'under', -110, o.total),
      ],
    },
  ]
}

function event(
  e: {
    eventId: string
    leagueId: string
    sport: string
    home: string
    away: string
    startsAt: string
    status?: NormalizedEvent['status']
  },
  odds: { mlHome: number; mlAway: number; spread: number; total: number },
  extraMarkets: NormalizedMarket[] = [],
): NormalizedEvent {
  return {
    eventId: e.eventId,
    leagueId: e.leagueId,
    sport: e.sport,
    home: e.home,
    away: e.away,
    startsAt: e.startsAt,
    status: e.status ?? 'pre',
    markets: [...teamMarkets(e.eventId, odds), ...extraMarkets],
  }
}

/** The seeded slate: Big 6 + UFC, one game live. Frozen ids/prices for deterministic tests. */
export const MOCK_EVENTS: NormalizedEvent[] = [
  // LIVE game — in progress, so the in-play UI has data.
  event(
    { eventId: 'mock-nba-lal-bos', leagueId: 'NBA', sport: 'BASKETBALL', home: 'Lakers', away: 'Celtics', startsAt: '2026-06-14T23:30:00Z', status: 'live' },
    { mlHome: -135, mlAway: 115, spread: -3.5, total: 224.5 },
    [
      // a player prop, so prop normalization has a fixture
      {
        marketId: 'mock-nba-lal-bos:prop:game:points:p-lebron',
        type: 'prop',
        period: 'game',
        statId: 'points',
        playerId: 'p-lebron',
        selections: [
          sel('mock-nba-lal-bos-points-p-lebron-over', 'over', -115, 27.5),
          sel('mock-nba-lal-bos-points-p-lebron-under', 'under', -105, 27.5),
        ],
      },
    ],
  ),
  event(
    { eventId: 'mock-nfl-kc-buf', leagueId: 'NFL', sport: 'FOOTBALL', home: 'Chiefs', away: 'Bills', startsAt: '2026-06-15T20:25:00Z' },
    { mlHome: -118, mlAway: -102, spread: -1.5, total: 48.5 },
  ),
  event(
    { eventId: 'mock-mlb-nyy-bos', leagueId: 'MLB', sport: 'BASEBALL', home: 'Yankees', away: 'Red Sox', startsAt: '2026-06-15T23:05:00Z' },
    { mlHome: -140, mlAway: 120, spread: -1.5, total: 8.5 },
  ),
  event(
    { eventId: 'mock-nhl-col-veg', leagueId: 'NHL', sport: 'HOCKEY', home: 'Avalanche', away: 'Golden Knights', startsAt: '2026-06-16T01:00:00Z' },
    { mlHome: -125, mlAway: 105, spread: -1.5, total: 6.5 },
  ),
  event(
    { eventId: 'mock-epl-ars-mci', leagueId: 'EPL', sport: 'SOCCER', home: 'Arsenal', away: 'Man City', startsAt: '2026-06-16T16:30:00Z' },
    { mlHome: 180, mlAway: 150, spread: 0.5, total: 2.5 },
  ),
  event(
    { eventId: 'mock-ncaaf-uga-ala', leagueId: 'NCAAF', sport: 'FOOTBALL', home: 'Georgia', away: 'Alabama', startsAt: '2026-06-16T20:00:00Z' },
    { mlHome: -160, mlAway: 135, spread: -3.5, total: 52.5 },
  ),
  // UFC — confirmed on the SGO free tier. A fight is a 2-fighter moneyline (no spread/total
  // by default); we still seed totals (rounds) lightly so the market tree isn't empty.
  event(
    { eventId: 'mock-ufc-jon-stipe', leagueId: 'UFC', sport: 'MMA', home: 'Jones', away: 'Miocic', startsAt: '2026-06-17T03:00:00Z' },
    { mlHome: -250, mlAway: 200, spread: -1.5, total: 2.5 },
  ),
]

export class MockProvider implements OddsFeedProvider {
  readonly name = 'mock'
  private readonly events: NormalizedEvent[]

  constructor(events: NormalizedEvent[] = MOCK_EVENTS) {
    this.events = events
  }

  async listEvents(leagueIds: string[], opts: ListEventsOptions = {}): Promise<NormalizedEvent[]> {
    let out = this.events
    if (leagueIds.length) out = out.filter((e) => leagueIds.includes(e.leagueId))
    if (opts.status) out = out.filter((e) => e.status === opts.status)
    if (opts.limit) out = out.slice(0, opts.limit)
    // Return clones so a caller mutating prices can't corrupt the shared seed.
    return out.map(clone)
  }

  async getEvent(eventId: string): Promise<NormalizedEvent | null> {
    const ev = this.events.find((e) => e.eventId === eventId)
    return ev ? clone(ev) : null
  }
}

function clone(e: NormalizedEvent): NormalizedEvent {
  return {
    ...e,
    markets: e.markets.map((m) => ({ ...m, selections: m.selections.map((s) => ({ ...s, priceRaw: { ...s.priceRaw }, priceDisplay: { ...s.priceDisplay } })) })),
  }
}
