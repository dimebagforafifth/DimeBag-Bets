/**
 * XP + levels — a pure progression curve. Linear for legibility: every level costs the
 * same XP, so the player's meter is easy to read and the math is trivial to verify.
 */

/** XP needed to advance one level. */
export const XP_PER_LEVEL = 100
/** XP earned for placing a (resolved) bet — the baseline play reward. */
export const XP_PER_BET = 10

export interface LevelInfo {
  /** 1-based level (level 1 at 0 XP). */
  level: number
  /** XP earned into the current level. */
  xpIntoLevel: number
  /** XP span of a level (constant). */
  xpForLevel: number
  /** Progress through the current level, 0..1 (for the meter). */
  pct: number
}

export function levelForXp(xp: number): LevelInfo {
  const safe = Math.max(0, Math.floor(xp))
  const level = Math.floor(safe / XP_PER_LEVEL) + 1
  const xpIntoLevel = safe % XP_PER_LEVEL
  return { level, xpIntoLevel, xpForLevel: XP_PER_LEVEL, pct: xpIntoLevel / XP_PER_LEVEL }
}

export function levelFromXp(xp: number): number {
  return levelForXp(xp).level
}
