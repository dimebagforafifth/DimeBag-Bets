/**
 * Seed data so the Pick'em board + "my entries" render fully populated in the demo.
 *
 * The live odds feed only carries a handful of player props, so we SUPPLEMENT it with a
 * seeded projection board (more players/stats across the same games). These are demo
 * projections only — real props still come from the feed (projections.feedProjections);
 * the board is the union (projections.boardProjections).
 *
 * SAMPLE_ENTRY_SPECS describe demo entries (power + flex; won / lost / open) that
 * entries.seedDemoEntries places on the CURRENT player through the real core money path —
 * nothing here moves money on its own.
 */

import type { Projection } from './projections.js'
import type { PickemMode } from './config.js'
import type { PickResult, PickSide } from './engine.js'

interface Game {
  eventId: string
  label: string
  league: string
  sport: string
  live: boolean
}

const GAMES: Record<string, Game> = {
  nba: {
    eventId: 'nba-lal-bos',
    label: 'Celtics @ Lakers',
    league: 'NBA',
    sport: 'Basketball',
    live: true,
  },
  nfl: {
    eventId: 'nfl-kc-buf',
    label: 'Bills @ Chiefs',
    league: 'NFL',
    sport: 'Football',
    live: false,
  },
  mlb: {
    eventId: 'mlb-lad-nyy',
    label: 'Yankees @ Dodgers',
    league: 'MLB',
    sport: 'Baseball',
    live: false,
  },
  nhl: {
    eventId: 'nhl-col-veg',
    label: 'Golden Knights @ Avalanche',
    league: 'NHL',
    sport: 'Hockey',
    live: false,
  },
}

const STAT_LABEL: Record<string, string> = {
  points: 'PTS',
  rebounds: 'REB',
  assists: 'AST',
  threes: '3PM',
  blocks: 'BLK',
  receiving_yards: 'Rec Yds',
  rushing_yards: 'Rush Yds',
  receptions: 'REC',
  total_bases: 'Bases',
  strikeouts: 'Ks',
  shots: 'SOG',
}

function proj(
  g: Game,
  player: string,
  stat: string,
  line: number,
  over = -115,
  under = -105,
): Projection {
  return {
    id: `${g.eventId}:${player}:${stat}`,
    eventId: g.eventId,
    eventLabel: g.label,
    league: g.league,
    sport: g.sport,
    playerId: player,
    playerName: player,
    statId: stat,
    statLabel: STAT_LABEL[stat] ?? stat,
    line,
    overAmerican: over,
    underAmerican: under,
    live: g.live,
    source: 'seed',
  }
}

/** Extra projections that fill out the demo board beyond the live feed's few props. */
export const MOCK_PROJECTIONS: Projection[] = [
  proj(GAMES.nba, 'J. Brown', 'points', 24.5, -120, +100),
  proj(GAMES.nba, 'A. Reaves', 'assists', 5.5),
  proj(GAMES.nba, 'L. James', 'rebounds', 7.5, -110, -110),
  proj(GAMES.nba, 'J. Tatum', 'threes', 3.5, +105, -125),
  proj(GAMES.nba, 'A. Davis', 'blocks', 2.5, +120, -140),
  proj(GAMES.nfl, 'T. Kelce', 'receiving_yards', 72.5),
  proj(GAMES.nfl, 'I. Pacheco', 'rushing_yards', 58.5),
  proj(GAMES.nfl, 'S. Diggs', 'receptions', 6.5, -130, +110),
  proj(GAMES.mlb, 'A. Judge', 'total_bases', 1.5, +105, -125),
  proj(GAMES.mlb, 'S. Ohtani', 'strikeouts', 7.5, -110, -110),
  proj(GAMES.nhl, 'N. MacKinnon', 'shots', 4.5, -125, +105),
]

/** A demo entry to seed: picks (by projection id + side), mode + stake, and an optional
 *  forced grading (projection id → result) for the settled samples. */
export interface SampleEntrySpec {
  mode: PickemMode
  stakeCents: number
  picks: Array<{ projectionId: string; side: PickSide }>
  /** When present the entry is settled with these results; absent → it stays open. */
  settle?: Record<string, PickResult>
}

/** Four demo entries on the current player: a POWER win, a FLEX partial, an open, a loss. */
export const SAMPLE_ENTRY_SPECS: SampleEntrySpec[] = [
  {
    // POWER 4-pick, all hit → 10× ($20 → $200)
    mode: 'power',
    stakeCents: 2_000,
    picks: [
      { projectionId: 'nba-lal-bos:L. James:points', side: 'higher' },
      { projectionId: 'nba-lal-bos:A. Davis:rebounds', side: 'higher' },
      { projectionId: 'nfl-kc-buf:T. Kelce:receiving_yards', side: 'higher' },
      { projectionId: 'mlb-lad-nyy:A. Judge:total_bases', side: 'higher' },
    ],
    settle: {
      'nba-lal-bos:L. James:points': 'higher',
      'nba-lal-bos:A. Davis:rebounds': 'higher',
      'nfl-kc-buf:T. Kelce:receiving_yards': 'higher',
      'mlb-lad-nyy:A. Judge:total_bases': 'higher',
    },
  },
  {
    // FLEX 5-pick, 4 of 5 → 2× ($10 → $20)
    mode: 'flex',
    stakeCents: 1_000,
    picks: [
      { projectionId: 'nba-lal-bos:J. Brown:points', side: 'higher' },
      { projectionId: 'nba-lal-bos:A. Reaves:assists', side: 'higher' },
      { projectionId: 'nfl-kc-buf:P. Mahomes:passing_yards', side: 'higher' },
      { projectionId: 'nfl-kc-buf:I. Pacheco:rushing_yards', side: 'lower' },
      { projectionId: 'nhl-col-veg:N. MacKinnon:shots', side: 'higher' },
    ],
    settle: {
      'nba-lal-bos:J. Brown:points': 'higher',
      'nba-lal-bos:A. Reaves:assists': 'higher',
      'nfl-kc-buf:P. Mahomes:passing_yards': 'higher',
      'nfl-kc-buf:I. Pacheco:rushing_yards': 'higher', // picked LOWER → the one miss
      'nhl-col-veg:N. MacKinnon:shots': 'higher',
    },
  },
  {
    // POWER 3-pick, still OPEN
    mode: 'power',
    stakeCents: 1_500,
    picks: [
      { projectionId: 'nba-lal-bos:J. Tatum:points', side: 'lower' },
      { projectionId: 'nfl-kc-buf:J. Allen:passing_yards', side: 'higher' },
      { projectionId: 'mlb-lad-nyy:S. Ohtani:strikeouts', side: 'lower' },
    ],
  },
  {
    // POWER 2-pick, a miss → LOST ($25)
    mode: 'power',
    stakeCents: 2_500,
    picks: [
      { projectionId: 'nba-lal-bos:J. Tatum:threes', side: 'higher' },
      { projectionId: 'nba-lal-bos:L. James:rebounds', side: 'higher' },
    ],
    settle: {
      'nba-lal-bos:J. Tatum:threes': 'lower', // picked HIGHER → miss → power loses
      'nba-lal-bos:L. James:rebounds': 'higher',
    },
  },
]
