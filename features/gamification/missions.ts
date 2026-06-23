/**
 * Missions/challenges — pure progress + refresh logic. A mission tracks one metric
 * toward a target within a period (daily/weekly); when the period rolls over, progress
 * refreshes. No money moves here — completion just flags the mission claimable.
 */

import type { MissionCadence, MissionDef, MissionProgress } from './types.js'

const DAY_MS = 86_400_000

/** The metric counts produced by one resolved bet. */
export interface PlayEvent {
  bets: number
  wagered: number
  wins: number
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * The key identifying which period a progress belongs to. Daily = the UTC date; weekly
 * = the UTC date of that week's Monday. A change in key means the mission has refreshed.
 */
export function periodKey(cadence: MissionCadence, now: number): string {
  const d = new Date(now)
  if (cadence === 'daily') return ymd(d)
  const dowMon = (d.getUTCDay() + 6) % 7 // 0 = Monday
  return `W:${ymd(new Date(now - dowMon * DAY_MS))}`
}

/** A zeroed progress for the mission's current period. */
export function freshProgress(def: MissionDef, now: number): MissionProgress {
  return { defId: def.id, periodKey: periodKey(def.cadence, now), progress: 0, completedAt: null, claimed: false }
}

/** The progress to use now — the stored one if it's for the current period, else a fresh
 *  (refreshed) one. */
export function currentProgress(prev: MissionProgress | undefined, def: MissionDef, now: number): MissionProgress {
  if (prev && prev.periodKey === periodKey(def.cadence, now)) return prev
  return freshProgress(def, now)
}

/** Apply a play event to a mission, refreshing the period first. Pure — returns new state. */
export function advanceMission(
  prev: MissionProgress | undefined,
  def: MissionDef,
  ev: PlayEvent,
  now: number,
): MissionProgress {
  const p = currentProgress(prev, def, now)
  const amount = ev[def.metric] // metric is one of bets|wagered|wins, matching PlayEvent
  if (amount <= 0) return p
  const progress = p.progress + amount
  const completedAt = p.completedAt ?? (progress >= def.target ? now : null)
  return { ...p, progress, completedAt }
}

/** Reached its target this period. */
export function isComplete(p: MissionProgress): boolean {
  return p.completedAt !== null
}

/** Completed but not yet paid out. */
export function isClaimable(p: MissionProgress): boolean {
  return p.completedAt !== null && !p.claimed
}
