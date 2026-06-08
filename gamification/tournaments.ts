/**
 * Tournaments — pure ranking + prize distribution. Players accrue a score (wagered /
 * profit / wins) while the window is open; ranking is score-desc with a deterministic
 * tiebreak; the prize pool is split across the top places by the configured percentages.
 */

import type { TournamentDef, TournamentStanding } from './types.js'

export interface TournamentEntry {
  id: string
  name: string
  score: number
}

/** Rank entries by score desc, ties broken by id asc (stable + deterministic). */
export function rankEntries(entries: TournamentEntry[]): Array<TournamentEntry & { position: number }> {
  return [...entries]
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((e, i) => ({ ...e, position: i + 1 }))
}

/** The prize (cents) for a 1-based finishing position, floored to a whole cent. */
export function prizeForPosition(position: number, def: TournamentDef): number {
  const pct = def.payoutPct[position - 1] ?? 0
  return Math.max(0, Math.floor(def.prizePoolCents * pct))
}

/** Full standings with each row's prize under the current config. */
export function standings(entries: TournamentEntry[], def: TournamentDef): TournamentStanding[] {
  return rankEntries(entries).map((r) => ({
    position: r.position,
    id: r.id,
    name: r.name,
    score: r.score,
    prizeCents: prizeForPosition(r.position, def),
  }))
}

/** Within its window (scores accrue). */
export function isLive(def: TournamentDef, now: number): boolean {
  return def.enabled && now >= def.startsAt && now < def.endsAt
}

/** Window has closed (ready to settle). */
export function hasEnded(def: TournamentDef, now: number): boolean {
  return now >= def.endsAt
}
