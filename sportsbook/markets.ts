/**
 * Sportsbook markets, fixtures, and grading (CLAUDE.md §4).
 *
 * This is the API-shaped data model: a `GameEvent` carries its markets, a live
 * `status` (upcoming → live → final) and a running `score`. A data feed
 * (see provider.ts / mockFeed.ts) fills these in; everything downstream — the
 * store, the UI, grading — reads this shape and never touches the source. Drop
 * in a real odds/scores API by implementing the feed; nothing here changes.
 *
 * `EVENTS` is the initial slate (all upcoming, no scores). Scripted demo
 * progression lives in the mock feed, not here.
 */

import type { Outcome } from '../core/index.js'

export type MarketKind = 'moneyline' | 'spread' | 'total'
export type Pick = 'home' | 'away' | 'over' | 'under'

/** Where an event is in its lifecycle. Betting is open only while `upcoming`. */
export type EventStatus = 'upcoming' | 'live' | 'final'

/** One bettable price on an event. */
export interface Selection {
  id: string
  eventId: string
  market: MarketKind
  pick: Pick
  /** What the player sees on the chip, e.g. "Lakers", "Lakers −3.5", "Over 220.5". */
  label: string
  /** American odds, locked onto the bet when placed (CLAUDE.md §4 bet acceptance). */
  odds: number
  /** Spread handicap for this side, or the total line. Undefined for moneyline. */
  line?: number
  /** True for an in-play market (priced live from the score); placeable only
   *  while its event is live. Pre-game selections leave this undefined. */
  live?: boolean
  /** Set by the book overlay (see book/overlay.ts) when a manager has suspended
   *  this market — the price shows but can't be bet. Never set by the feed. */
  suspended?: boolean
}

/** A final score; `official: false` voids every bet on the event (CLAUDE.md §4). */
export interface MatchResult {
  home: number
  away: number
  official?: boolean
}

export interface GameEvent {
  id: string
  league: string
  home: string
  away: string
  /** Display-only kickoff label. */
  startsAt: string
  selections: Selection[]
  /** Lifecycle state, set by the feed. Betting is open only while `upcoming`. */
  status: EventStatus
  /** Running score once `live`, the final once `final`. Absent while upcoming. */
  score?: MatchResult
  /** Live clock/period label (e.g. "Q3"), set by the feed while `live`. */
  clock?: string
  /** Fraction of the game elapsed, 0..1 (the feed sets it; powers live win
   *  probability & cash-out). 1 once final, absent while upcoming. */
  progress?: number
}

const STD = -110 // standard spread/total juice

/** Build the six standard selections for an event from compact inputs. */
function makeEvent(
  e: {
    id: string
    league: string
    home: string
    away: string
    startsAt: string
    mlHome: number
    mlAway: number
    /** Home spread (negative if home is the favourite), e.g. −3.5. */
    spread: number
    total: number
  },
): GameEvent {
  const sel = (
    market: MarketKind,
    pick: Pick,
    label: string,
    odds: number,
    line?: number,
  ): Selection => ({ id: `${e.id}-${market}-${pick}`, eventId: e.id, market, pick, label, odds, line })

  const sgn = (n: number) => (n > 0 ? `+${n}` : `${n}`)
  return {
    id: e.id,
    league: e.league,
    home: e.home,
    away: e.away,
    startsAt: e.startsAt,
    status: 'upcoming',
    selections: [
      sel('moneyline', 'home', e.home, e.mlHome),
      sel('moneyline', 'away', e.away, e.mlAway),
      sel('spread', 'home', `${e.home} ${sgn(e.spread)}`, STD, e.spread),
      sel('spread', 'away', `${e.away} ${sgn(-e.spread)}`, STD, -e.spread),
      sel('total', 'over', `Over ${e.total}`, STD, e.total),
      sel('total', 'under', `Under ${e.total}`, STD, e.total),
    ],
  }
}

/** The initial slate, all upcoming. A feed sets each event's status/score. */
export const EVENTS: GameEvent[] = [
  makeEvent({
    id: 'nba-lal-bos',
    league: 'NBA',
    home: 'Lakers',
    away: 'Celtics',
    startsAt: 'Today 7:30 PM',
    mlHome: -135,
    mlAway: +115,
    spread: -3.5,
    total: 224.5,
  }),
  makeEvent({
    id: 'nba-gsw-den',
    league: 'NBA',
    home: 'Warriors',
    away: 'Nuggets',
    startsAt: 'Today 10:00 PM',
    mlHome: +120,
    mlAway: -140,
    spread: +2.5,
    total: 231.5,
  }),
  makeEvent({
    id: 'nfl-kc-buf',
    league: 'NFL',
    home: 'Chiefs',
    away: 'Bills',
    startsAt: 'Sun 4:25 PM',
    mlHome: -118,
    mlAway: -102,
    spread: -1.5,
    total: 48.5,
  }),
  makeEvent({
    id: 'nfl-sf-dal',
    league: 'NFL',
    home: '49ers',
    away: 'Cowboys',
    startsAt: 'Sun 8:20 PM',
    mlHome: -160,
    mlAway: +135,
    spread: -3.5,
    total: 45.5,
  }),
  makeEvent({
    id: 'epl-ars-mci',
    league: 'EPL',
    home: 'Arsenal',
    away: 'Man City',
    startsAt: 'Sat 12:30 PM',
    mlHome: +180,
    mlAway: +150,
    spread: +0.5,
    total: 2.5,
  }),
  makeEvent({
    id: 'nhl-col-veg',
    league: 'NHL',
    home: 'Avalanche',
    away: 'Golden Knights',
    startsAt: 'Today 9:00 PM',
    mlHome: -125,
    mlAway: +105,
    spread: -1.5,
    total: 6.5,
  }),
]

/** The distinct leagues on the slate, in first-seen order (for the filter). */
export const LEAGUES: string[] = [...new Set(EVENTS.map((e) => e.league))]

/** Quick lookup of an event by id. */
export function findEvent(id: string): GameEvent | undefined {
  return EVENTS.find((e) => e.id === id)
}

/**
 * Grade one selection against a final score into a core Outcome.
 *  - no result / not official → void (stake returned)
 *  - moneyline: higher score wins; a tie pushes
 *  - spread: the side's score + its handicap vs the other side; exactly 0 pushes
 *  - total: combined score vs the line; exactly on the line pushes
 * Half-point lines can't land on a push, by construction (CLAUDE.md §4).
 */
export function gradeSelection(sel: Selection, result: MatchResult | null | undefined): Outcome {
  if (!result || result.official === false) return 'void'
  const { home, away } = result

  if (sel.market === 'moneyline') {
    if (home === away) return 'push'
    const homeWon = home > away
    const tookHome = sel.pick === 'home'
    return tookHome === homeWon ? 'win' : 'loss'
  }

  if (sel.market === 'spread') {
    const line = sel.line ?? 0
    const cover = sel.pick === 'home' ? home + line - away : away + line - home
    return cover > 0 ? 'win' : cover === 0 ? 'push' : 'loss'
  }

  // total
  const line = sel.line ?? 0
  const sum = home + away
  if (sum === line) return 'push'
  const wentOver = sum > line
  const tookOver = sel.pick === 'over'
  return tookOver === wentOver ? 'win' : 'loss'
}
