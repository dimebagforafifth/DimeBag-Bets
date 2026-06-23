/**
 * Pick'em grading — PURE. Given each pick's side (higher/lower) and the graded result per
 * projection, work out how many hit and what the entry pays. Two house rules, modeled on
 * the industry standard and CLAUDE.md §4:
 *
 *  - VOID drops out: a projection that voids (player DNP, postponed, exact push on the line)
 *    is removed and the entry plays at the LOWER count — exactly like a void parlay leg. If
 *    too few legs survive (< MIN_PICKS) the whole entry voids and the stake is returned.
 *  - FLEX falls back to POWER if voids drop it below FLEX_MIN_PICKS legs.
 *
 * The result is a single TOTAL-RETURN multiplier the money layer settles through core's
 * `resolveAtMultiplier` (0 = lost, < 1 = a flex consolation, ≥ 1 = a win / returned stake).
 */

import { FLEX_MIN_PICKS, MIN_PICKS, payoutMultiple, type PickemMode } from './config.js'

/** Which way a pick is made. */
export type PickSide = 'higher' | 'lower'
/** How a projection graded: it went higher, went lower, or voided (removed). */
export type PickResult = 'higher' | 'lower' | 'void'

export interface GradedEntry {
  /** Legs that didn't void — the count the payout table is read at. */
  effectivePicks: number
  /** How many surviving legs were correct. */
  correct: number
  /** The mode actually applied (FLEX degrades to POWER below FLEX_MIN_PICKS legs). */
  mode: PickemMode
  /** TOTAL-RETURN multiple the entry settles at (what core.resolveAtMultiplier receives). */
  multiplier: number
  /** Player-facing status: a net win, a net loss, or a returned-stake void. */
  status: 'won' | 'lost' | 'void'
}

interface GradePick {
  id: string
  side: PickSide
}

/**
 * Grade an entry. `results` maps a pick's id → its graded result; an id missing from
 * `results` is treated as not-yet-graded and counted as a void (drops out) — settle only
 * when every leg has a result. Returns the effective count, correct count, and the single
 * settlement multiplier.
 */
export function gradeEntry(
  mode: PickemMode,
  picks: GradePick[],
  results: Record<string, PickResult>,
): GradedEntry {
  const live = picks.filter((p) => results[p.id] && results[p.id] !== 'void')
  const effectivePicks = live.length

  // FLEX needs enough legs for a "miss one" tier; below that it plays as POWER.
  const effMode: PickemMode = mode === 'flex' && effectivePicks < FLEX_MIN_PICKS ? 'power' : mode

  // Too few legs survived → the whole entry voids, stake returned (multiplier 1).
  if (effectivePicks < MIN_PICKS) {
    return { effectivePicks, correct: 0, mode: effMode, multiplier: 1, status: 'void' }
  }

  const correct = live.filter((p) => results[p.id] === p.side).length
  const multiplier = payoutMultiple(effMode, effectivePicks, correct)
  const status: GradedEntry['status'] = multiplier > 1 ? 'won' : multiplier === 1 ? 'void' : 'lost'

  return { effectivePicks, correct, mode: effMode, multiplier, status }
}

/* ----------------------------- contradiction guard --------------------------- */

/** The identity of the underlying projection a pick is on — you may take at most ONE side
 *  of a given player+stat in an entry (no Over AND Under, no the-same-prop-twice). */
export function pickIdentity(p: { playerId: string; statId: string }): string {
  return `${p.playerId}::${p.statId}`
}

/**
 * True when an entry contains contradictory / duplicate picks: two picks on the same
 * player+stat (whether opposite sides or the same one twice). Such an entry is mutually
 * exclusive or a guaranteed-loser and must be refused.
 */
export function hasContradiction(picks: Array<{ playerId: string; statId: string }>): boolean {
  const seen = new Set<string>()
  for (const p of picks) {
    const key = pickIdentity(p)
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}
