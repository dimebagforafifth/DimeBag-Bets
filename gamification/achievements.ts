/**
 * Achievements/badges — pure unlock checks against a player's lifetime stats + level.
 * Earning is one-shot (once unlocked, it stays); the store records the unlock and pays
 * the reward on claim.
 */

import { levelFromXp } from './xp.js'
import type { AchievementDef, AchievementMetric, PlayerState } from './types.js'

/** The player's current value for an achievement metric. */
export function statValue(metric: AchievementMetric, p: PlayerState): number {
  switch (metric) {
    case 'lifetimeBets':
      return p.lifetimeBets
    case 'lifetimeWagered':
      return p.lifetimeWagered
    case 'lifetimeWins':
      return p.lifetimeWins
    case 'level':
      return levelFromXp(p.xp)
  }
}

/** Whether the player currently meets an achievement's threshold. */
export function isUnlocked(def: AchievementDef, p: PlayerState): boolean {
  return def.enabled && statValue(def.metric, p) >= def.threshold
}

/** Enabled achievements the player has just earned but doesn't yet have recorded. */
export function newlyUnlocked(defs: AchievementDef[], p: PlayerState): AchievementDef[] {
  return defs.filter((d) => isUnlocked(d, p) && !p.achievements[d.id])
}
