/**
 * Game Admin store — a SEAM placeholder for two per-game operator flags that the
 * book overlay (sportsbook/book/overlay.ts) does NOT model yet:
 *
 *  - "circled" — a reduced-limits flag (the bookie's term for a game taken down
 *    to low max bets because the line is soft / sharp money is on it). Core and
 *    the overlay have no such field, so we hold it here.
 *  - per-game limit — the max coins the book will take on a single game. Real
 *    per-game limits will live in core/book (alongside creditLimit) so they
 *    actually clamp placeWager (CLAUDE.md §3 availableToWager); until then this
 *    is operator-visible state only.
 *
 * // SEAM: circled + per-game limit move into core/book once the contract grows a
 * // per-market limit field. // TODO(api)
 *
 * Mirrors the overlay's singleton shape exactly (module-level state + a version
 * counter + a listener set) so a panel can drive it with useSyncExternalStore,
 * and it stays pure and trivially testable. COINS ONLY — limits are whole coins.
 */

/* ------------------------------- the state ------------------------------- */

const circled = new Set<string>() // eventIds taken down to reduced limits
const limits = new Map<string, number>() // eventId -> max coins on the game
let version = 0
const listeners = new Set<() => void>()

function bump(): void {
  version += 1
  for (const l of listeners) {
    try {
      l()
    } catch {
      /* a listener must never break game admin */
    }
  }
}

/* ------------------------------ subscription ----------------------------- */

/** Subscribe to game-admin changes (for useSyncExternalStore / a panel). */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A version counter that ticks on every change (for useSyncExternalStore). */
export function getVersion(): number {
  return version
}

/* ------------------------------- circling -------------------------------- */

/** Whether a game is circled (reduced limits). */
export function isCircled(eventId: string): boolean {
  return circled.has(eventId)
}

/** Circle / un-circle a game. */
export function setCircled(eventId: string, on: boolean): void {
  if (on === circled.has(eventId)) return
  if (on) circled.add(eventId)
  else circled.delete(eventId)
  bump()
}

/* -------------------------------- limits --------------------------------- */

/** The per-game max (in whole coins), or null if none is set. */
export function getLimit(eventId: string): number | null {
  return limits.get(eventId) ?? null
}

/**
 * Set a per-game max in whole coins, or clear it with null / a non-positive value.
 * Coins are clamped to a non-negative integer (no fractional or negative caps).
 */
export function setLimit(eventId: string, coins: number | null): void {
  if (coins == null || !Number.isFinite(coins) || coins <= 0) {
    if (limits.delete(eventId)) bump()
    return
  }
  const next = Math.floor(coins)
  if (limits.get(eventId) === next) return
  limits.set(eventId, next)
  bump()
}

/** Clear all game-admin flags (mainly for tests / a reset). */
export function resetGameAdmin(): void {
  circled.clear()
  limits.clear()
  bump()
}
