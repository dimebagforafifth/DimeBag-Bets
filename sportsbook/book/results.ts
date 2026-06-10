/**
 * The results overlay (CLAUDE.md §4) — the operator's manual grading, applied on
 * top of whatever the data feed reports.
 *
 * Normally the feed (mock now, a real scores API later) finals an event and posts
 * the official score, which settles every open bet through `core`. But an operator
 * must be able to act on results the feed can't decide:
 *  - enter (or correct) a final result by hand — graded as official win/loss/push,
 *  - VOID a fixture that was postponed / abandoned / not official — stake returned
 *    on every bet (CLAUDE.md §4: official results are the source of truth; abandoned
 *    games and palpable errors are voided).
 *
 * Like the line overlay (book/overlay.ts) and the futures winner declaration
 * (book/futures.ts), this is one shared book — one set of results, every player
 * settles against the same outcomes — so it's a module-level singleton. Each
 * player's `SportsbookStore` applies it AFTER the line overlay and re-grades on
 * change, so a manual result settles all open tickets on that event at once.
 *
 * An override WINS over the feed: once the operator sets or voids a result the event
 * stays final at that outcome (even if the looping demo feed would re-open it) until
 * the operator clears it back to feed control.
 */

import type { GameEvent, MatchResult } from '../markets.js'

/** An operator's manual outcome for one fixture. */
export type ResultOverride =
  | { kind: 'final'; home: number; away: number } // graded as the official result
  | { kind: 'void' } // not official — every bet's stake is returned

/* ------------------------------- the state ------------------------------- */

const overrides = new Map<string, ResultOverride>()
let version = 0
const listeners = new Set<() => void>()

function bump(): void {
  version += 1
  for (const l of listeners) {
    try {
      l()
    } catch {
      /* a listener must never break grading */
    }
  }
}

/* ------------------------------- reading -------------------------------- */

/** Subscribe to results changes (for useSyncExternalStore / the store). */
export function subscribeResults(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A version counter that ticks on every change (for useSyncExternalStore). */
export function getResultsVersion(): number {
  return version
}

/** The operator's manual outcome for an event, or undefined if it's feed-controlled. */
export function getResult(eventId: string): ResultOverride | undefined {
  return overrides.get(eventId)
}

/** Whether this fixture has been graded/voided by hand (vs left to the feed). */
export function isResultOverridden(eventId: string): boolean {
  return overrides.has(eventId)
}

/* ------------------------------- mutating ------------------------------- */

/** Enter (or correct) a final result by hand — graded as the official outcome.
 *  Scores must be whole, non-negative numbers. */
export function setResult(eventId: string, home: number, away: number): void {
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    throw new Error('Enter whole scores of 0 or more for both sides.')
  }
  overrides.set(eventId, { kind: 'final', home, away })
  bump()
}

/** Void a fixture (postponed / abandoned / not official) — every bet's stake returns. */
export function voidEvent(eventId: string): void {
  overrides.set(eventId, { kind: 'void' })
  bump()
}

/** Hand the fixture back to the feed (drop the manual override). Already-settled
 *  tickets stay settled — clearing only returns future grading to the feed. */
export function clearResult(eventId: string): void {
  if (overrides.delete(eventId)) bump()
}

/** Clear every manual result (mainly for tests / reset). */
export function resetResults(): void {
  if (overrides.size === 0) return
  overrides.clear()
  bump()
}

/* ----------------------------- applying it ------------------------------ */

/**
 * Merge the operator's manual results into a slate. An overridden event becomes
 * `final` with the operator's score — `official: true` for a hand-entered result so
 * core grades win/loss/push, or `official: false` for a void so `gradeSelection`
 * returns 'void' and core returns the stake on every bet. Returns the same array
 * reference when nothing is overridden, so the store stays cheap when clean.
 */
export function applyResults(events: GameEvent[]): GameEvent[] {
  if (overrides.size === 0) return events
  return events.map((e) => {
    const o = overrides.get(e.id)
    if (!o) return e
    const score: MatchResult =
      o.kind === 'final'
        ? { home: o.home, away: o.away, official: true }
        : { home: e.score?.home ?? 0, away: e.score?.away ?? 0, official: false }
    return { ...e, status: 'final', score, progress: 1 }
  })
}
