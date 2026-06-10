/**
 * Per-sport / per-market wager caps (NEW). Core enforces a single GLOBAL per-head cap
 * (`account.maxWager` / `minWager`) — the hard limit. Books also want finer caps: a book
 * default per sport, with per-player overrides (e.g. circle a sharp player on NFL only).
 * Core/sportsbook don't consult per-sport caps at placement yet, so these are advisory
 * operator config, persisted so they survive a reload.
 *
 * // SEAM / TODO(api): enforcement — the bet-placement path (sportsbook engine) should
 * // consult `effectiveCap(playerId, sport)` and reject/scale a stake that exceeds it.
 * // Until then the global core cap is the enforced ceiling and these are guidance.
 */

import { createStore, persistedDoc, type Doc } from '../../persistence/index.js'

export const SPORTS = ['NFL', 'NBA', 'MLB', 'NHL', 'Soccer'] as const
export type Sport = (typeof SPORTS)[number]

interface LimitsDoc {
  /** Book-wide default cap per sport (cents; null = no cap). */
  defaults: Record<string, number | null>
  /** Per-player, per-sport override caps (cents; null = no cap). */
  overrides: Record<string, Record<string, number | null>>
}

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<LimitsDoc> = persistedDoc<LimitsDoc>(store, 'players.sportLimits', {
  version: 1,
  initial: { defaults: {}, overrides: {} },
})

let state: LimitsDoc = DOC.load()
const listeners = new Set<() => void>()
let version = 0

function commit(): void {
  DOC.save(state)
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeLimits(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function getLimitsVersion(): number {
  return version
}

export function getBookDefault(sport: string): number | null {
  return state.defaults[sport] ?? null
}
export function setBookDefault(sport: string, cents: number | null): void {
  state = { ...state, defaults: { ...state.defaults, [sport]: cents } }
  commit()
}

export function getPlayerCap(playerId: string, sport: string): number | null {
  return state.overrides[playerId]?.[sport] ?? null
}
export function setPlayerCap(playerId: string, sport: string, cents: number | null): void {
  const forPlayer = { ...(state.overrides[playerId] ?? {}), [sport]: cents }
  state = { ...state, overrides: { ...state.overrides, [playerId]: forPlayer } }
  commit()
}

/** The cap that applies to a player on a sport: their override, else the book default. */
export function effectiveCap(playerId: string, sport: string): number | null {
  const override = state.overrides[playerId]?.[sport]
  if (override !== undefined && override !== null) return override
  return getBookDefault(sport)
}

/** Reset all caps (tests). */
export function __resetLimits(): void {
  state = { defaults: {}, overrides: {} }
  commit()
}
