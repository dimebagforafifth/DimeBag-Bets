/**
 * Translate the external odds/scores DTO (sportsdata/types) into our internal
 * `GameEvent` shape (sportsbook/markets). This is the ONLY place that knows a
 * vendor's field names; everything downstream — the store, pricing, live model,
 * grading, UI — speaks `GameEvent`. Pure functions, so the whole mapping is
 * unit-testable without a network.
 */

import type {
  EventStatus,
  GameEvent,
  MarketKind,
  MatchResult,
  Pick,
  Selection,
} from '../sportsbook/index.js'
import type { ApiBookmaker, ApiEvent, ApiMarket, ApiOutcome } from './types.js'

const MARKET_OF: Record<ApiMarket['key'], MarketKind> = {
  h2h: 'moneyline',
  spreads: 'spread',
  totals: 'total',
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

/** The Odds API's `sport_key` ("basketball_nba", "soccer_epl") → a friendly sport
 *  name ("Basketball", "Soccer"). Falls back to the league title when no key is
 *  given, so the sport tier is always populated. */
function sportOf(api: ApiEvent): string {
  const key = api.sport_key
  if (!key) return api.sport_title
  const group = key.split('_')[0]
  return group.charAt(0).toUpperCase() + group.slice(1)
}

/** Lifecycle: trust an explicit status, else derive from completed/scores. */
function statusOf(api: ApiEvent): EventStatus {
  if (api.status) return api.status
  if (api.completed) return 'final'
  return api.scores && api.scores.length > 0 ? 'live' : 'upcoming'
}

/** The running/final score, matched to home/away by team name. Names are
 *  normalized (trimmed, case-insensitive) because the scores endpoint and the
 *  odds endpoint can label the same team slightly differently — a brittle exact
 *  match would silently drop the score and (for a finished game) void every bet. */
function scoreOf(api: ApiEvent): MatchResult | undefined {
  if (!api.scores || api.scores.length === 0) return undefined
  const norm = (s: string) => s.trim().toLowerCase()
  const byName = new Map(api.scores.map((s) => [norm(s.name), s.score]))
  const home = byName.get(norm(api.home_team))
  const away = byName.get(norm(api.away_team))
  if (home == null || away == null) return undefined
  const official = api.official ?? (api.completed ? true : undefined)
  return { home, away, official }
}

/** Human kickoff label from an ISO time (display only); falls back to the raw
 *  string if it isn't a parseable date. */
function formatKickoff(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  } catch {
    return iso
  }
}

function pickBookmaker(api: ApiEvent, preferred?: string): ApiBookmaker | undefined {
  if (preferred) {
    const match = api.bookmakers.find((b) => b.key === preferred)
    if (match) return match
  }
  return api.bookmakers[0]
}

/** One API outcome → one of our selections (or null if unrecognized). */
function mapOutcome(api: ApiEvent, kind: MarketKind, o: ApiOutcome): Selection | null {
  const make = (pick: Pick, label: string, line?: number): Selection => ({
    id: `${api.id}-${kind}-${pick}`,
    eventId: api.id,
    market: kind,
    pick,
    label,
    odds: o.price,
    line,
  })

  if (kind === 'moneyline') {
    if (o.name === api.home_team) return make('home', api.home_team)
    if (o.name === api.away_team) return make('away', api.away_team)
    return null
  }
  if (kind === 'spread') {
    const point = o.point ?? 0
    if (o.name === api.home_team) return make('home', `${api.home_team} ${signed(point)}`, point)
    if (o.name === api.away_team) return make('away', `${api.away_team} ${signed(point)}`, point)
    return null
  }
  // totals
  const point = o.point ?? 0
  const side = o.name.toLowerCase()
  if (side === 'over') return make('over', `Over ${point}`, point)
  if (side === 'under') return make('under', `Under ${point}`, point)
  return null
}

function selectionsOf(api: ApiEvent, book: ApiBookmaker | undefined): Selection[] {
  if (!book) return []
  const out: Selection[] = []
  for (const market of book.markets) {
    const kind = MARKET_OF[market.key]
    if (!kind) continue
    for (const outcome of market.outcomes) {
      const sel = mapOutcome(api, kind, outcome)
      if (sel) out.push(sel)
    }
  }
  return out
}

export interface MapOptions {
  /** Which bookmaker's prices to read; defaults to the first listed. */
  bookmaker?: string
}

/** One external event → one internal `GameEvent`. */
export function mapEvent(api: ApiEvent, opts: MapOptions = {}): GameEvent {
  const score = scoreOf(api)
  // Never report a game final without a usable score: the store would grade it
  // and, finding no result, void every bet. Downgrade to live so settlement
  // waits for the real score instead of paying everyone their stake back.
  let status = statusOf(api)
  if (status === 'final' && !score) status = 'live'

  return {
    id: api.id,
    sport: sportOf(api),
    league: api.sport_title,
    home: api.home_team,
    away: api.away_team,
    startsAt: formatKickoff(api.commence_time),
    status,
    score,
    clock: api.clock,
    progress: api.progress,
    selections: selectionsOf(api, pickBookmaker(api, opts.bookmaker)),
  }
}

/** A whole external slate → our `GameEvent[]`. */
export function mapSlate(api: ApiEvent[], opts: MapOptions = {}): GameEvent[] {
  return api.map((e) => mapEvent(e, opts))
}
