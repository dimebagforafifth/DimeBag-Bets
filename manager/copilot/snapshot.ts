/**
 * AI Manager Copilot — the read-only book snapshot it reasons over (CLAUDE.md §4).
 *
 * Composes the EXISTING read models (reporting rollups + org read-models) into one
 * object an advisor can analyze. It is strictly READ-ONLY — it reads analytics
 * records and the org tree, computes, and returns; it holds no write access and
 * never touches money or the tree. `now` is injected so it stays pure.
 */

import {
  bookActivity,
  engagement,
  inRange,
  perGameHold,
  perPlayerActivity,
  type AnalyticsRecord,
  type BookActivity,
  type Engagement,
  type GameHold,
  type PlayerActivity,
} from '../reporting/analytics.js'
import { bookFigure, creditUtilization, getMember, playerCount, type Org } from '../../features/org/index.js'

const DAY = 86_400_000

export interface BookSnapshot {
  now: number
  windowDays: number
  /** Book-wide play in the window. */
  activity: BookActivity
  games: GameHold[]
  engagement: Engagement
  /** Players by turnover (window), highest first. */
  topPlayers: PlayerActivity[]
  /** Rolled-up figure across the whole book (cents). */
  bookFigure: number
  /** Manager-level credit utilization, 0..1. */
  creditUtilization: number
  /** Player count across the book. */
  players: number
}

export function buildSnapshot(records: AnalyticsRecord[], org: Org, now: number, windowDays: number): BookSnapshot {
  const windowed = inRange(records, now - windowDays * DAY, now + 1)
  const mgr = getMember(org, org.managerId)
  return {
    now,
    windowDays,
    activity: bookActivity(windowed),
    games: perGameHold(windowed),
    engagement: engagement(records, now, windowDays),
    topPlayers: perPlayerActivity(windowed),
    bookFigure: bookFigure(org, org.managerId),
    creditUtilization: creditUtilization(mgr),
    players: playerCount(org, org.managerId),
  }
}
