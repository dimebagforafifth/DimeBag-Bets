/**
 * Rate-limit backoff for the odds feed (CLAUDE.md §4, §6).
 *
 * Real odds APIs throttle (429) and have bad minutes (5xx). `withBackoff` wraps any
 * async pull so that, after a failure, the next call inside an exponentially-growing
 * window short-circuits instead of hammering the vendor — protecting the request
 * budget. On success the window resets. Compose it UNDER `cachedSlate` so good data is
 * still served while we're backing off:
 *
 *   const pull = cachedSlate(withBackoff(provider.fetchSlate, { baseMs: 2000 }))
 *
 * The clock is injectable so it's unit-testable without timers. (Vendor `Retry-After`
 * headers are honoured one level down, at the fetch/cache layer that can read them;
 * this layer is the slate-level guard.)
 */

export interface BackoffOptions {
  /** First backoff delay after a failure. Default 1000ms. */
  baseMs?: number
  /** Ceiling on the backoff delay. Default 60000ms. */
  maxMs?: number
  /** Growth factor per consecutive failure. Default 2. */
  factor?: number
  /** Injected clock for tests. Default `Date.now`. */
  now?: () => number
}

export interface Backoff<T> {
  (): Promise<T>
  /** Consecutive failures since the last success (0 when healthy). */
  failures(): number
  /** Epoch ms the next attempt is allowed (0 when healthy). */
  nextAllowedAt(): number
}

export function withBackoff<T>(fn: () => Promise<T>, opts: BackoffOptions = {}): Backoff<T> {
  const base = opts.baseMs ?? 1000
  const max = opts.maxMs ?? 60_000
  const factor = opts.factor ?? 2
  const now = opts.now ?? (() => Date.now())

  let failures = 0
  let nextAllowed = 0

  const run = (async () => {
    if (failures > 0 && now() < nextAllowed) {
      throw new Error(`odds feed backing off after ${failures} failure(s); retry at ${nextAllowed}`)
    }
    try {
      const result = await fn()
      failures = 0
      nextAllowed = 0
      return result
    } catch (err) {
      failures += 1
      const delay = Math.min(max, base * factor ** (failures - 1))
      nextAllowed = now() + delay
      throw err
    }
  }) as Backoff<T>

  run.failures = () => failures
  run.nextAllowedAt = () => nextAllowed
  return run
}
