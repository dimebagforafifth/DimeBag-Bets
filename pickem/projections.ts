/**
 * Projections — the Pick'em board, READ-ONLY off the shared odds feed.
 *
 * The product is built on PLAYER PROPS, which already flow through lib/odds as markets of
 * `type: 'prop'` (a player + stat + line + over/under). This module reads that slate and
 * maps each prop to a `Projection` (the higher/lower row a player taps). It NEVER edits
 * lib/odds pricing or the contract — it consumes them. The live feed only seeds a few
 * props, so the demo board is the feed UNION a seeded set (see mock.ts) so it renders full.
 *
 * Pick'em is a FIXED-ODDS product: the over/under prices are shown for context only; the
 * payout comes from the pick-count table (config.ts), not the leg prices.
 */

import type { NormalizedEvent } from '../lib/odds/contract.js'
import { getBookOddsSnapshot, subscribeBookOdds } from '../app/book/odds-source.js'
import { MOCK_PROJECTIONS } from './mock.js'

/** One higher/lower row on the board. */
export interface Projection {
  /** Stable id: `${eventId}:${playerId}:${statId}`. */
  id: string
  eventId: string
  /** "Celtics @ Lakers" — away @ home. */
  eventLabel: string
  league: string
  sport: string
  playerId: string
  playerName: string
  statId: string
  /** Short stat label, e.g. 'PTS', 'REB', 'Pass Yds'. */
  statLabel: string
  /** The projection line the player goes higher/lower on. */
  line: number
  /** Over/under display prices (context only — Pick'em pays the fixed table, not these). */
  overAmerican: number
  underAmerican: number
  /** Whether the game is in-play. */
  live: boolean
  /** Where the row came from — the live feed or the seeded demo board. */
  source: 'feed' | 'seed'
}

const STAT_LABEL: Readonly<Record<string, string>> = {
  points: 'PTS',
  rebounds: 'REB',
  assists: 'AST',
  threes: '3PM',
  steals: 'STL',
  blocks: 'BLK',
  passing_yards: 'Pass Yds',
  rushing_yards: 'Rush Yds',
  receiving_yards: 'Rec Yds',
  receptions: 'REC',
  total_bases: 'Bases',
  strikeouts: 'Ks',
  goals: 'Goals',
  shots: 'SOG',
  saves: 'Saves',
}

/** A short label for a stat id (falls back to the raw id). */
export function statLabel(statId: string): string {
  return STAT_LABEL[statId] ?? statId
}

/**
 * Map the odds feed's player-prop markets to Pick'em projections. PURE given a slate, so
 * tests pass a hand-built one; `boardProjections()` defaults to the live slate.
 */
export function feedProjections(events: NormalizedEvent[]): Projection[] {
  const out: Projection[] = []
  for (const ev of events) {
    for (const m of ev.markets) {
      if (m.type !== 'prop' || !m.playerId || !m.statId) continue
      const over = m.selections.find((s) => s.side === 'over')
      const under = m.selections.find((s) => s.side === 'under')
      const line = over?.line ?? under?.line
      if (line == null) continue
      out.push({
        id: `${ev.eventId}:${m.playerId}:${m.statId}`,
        eventId: ev.eventId,
        eventLabel: `${ev.away} @ ${ev.home}`,
        league: ev.leagueId,
        sport: ev.sport,
        playerId: m.playerId,
        playerName: m.playerId,
        statId: m.statId,
        statLabel: statLabel(m.statId),
        line,
        overAmerican: over?.priceDisplay.american ?? 0,
        underAmerican: under?.priceDisplay.american ?? 0,
        live: ev.status === 'live',
        source: 'feed',
      })
    }
  }
  return out
}

/**
 * The full Pick'em board: live feed props first, then any seeded projections not already on
 * the feed (deduped by id, feed wins). Defaults to the live slate; pass `events` in tests.
 */
export function boardProjections(events?: NormalizedEvent[]): Projection[] {
  const slate = events ?? getBookOddsSnapshot().events
  const feed = feedProjections(slate)
  const seen = new Set(feed.map((p) => p.id))
  return [...feed, ...MOCK_PROJECTIONS.filter((p) => !seen.has(p.id))]
}

/** Find one projection by id across the current board. */
export function findProjection(id: string, events?: NormalizedEvent[]): Projection | null {
  return boardProjections(events).find((p) => p.id === id) ?? null
}

/** Re-export the odds subscribe so the UI re-renders when the live slate moves, without
 *  importing app/book directly. */
export { subscribeBookOdds }
