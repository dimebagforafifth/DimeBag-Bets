/**
 * Quota-stretching wrappers for the odds feed (CLAUDE.md §4, §6).
 *
 * Real odds APIs bill per request, so we stretch the budget three ways:
 *  - `etagFetch`  — conditional requests with ETags; a `304 Not Modified` serves
 *    the cached body (no re-download, and on APIs that don't bill 304s, no quota);
 *  - `cachedSlate` — throttle a `fetchSlate` so polls inside a window dedupe to
 *    one real call, and serve the last good slate on a transient error;
 *  - `createQuotaTracker` — accumulate the quota the client reports, for the
 *    status UI and for backing off when it runs low.
 *
 * All composable with `createOddsApiSlate` / `createHttpFeed`, and injectable
 * (clock, fetch) so they're unit-testable without a network or timers.
 */

import type { ApiEvent } from '../types.js'
import type { FetchLike, Quota } from './theOddsApi.js'

/** A fetch that accepts request headers — the global `fetch` satisfies it. */
export type RawFetch = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
  headers: { get(name: string): string | null }
}>

/**
 * Wrap a fetch with ETag conditional requests: remember each URL's body + ETag,
 * send `If-None-Match` next time, and on a `304 Not Modified` serve the cached
 * body. Returns a `FetchLike` that drops into `createOddsApiSlate({ fetchFn })`.
 */
export function etagFetch(raw: RawFetch): FetchLike {
  const cache = new Map<string, { etag: string; body: unknown }>()
  return async (url) => {
    const cached = cache.get(url)
    const headers: Record<string, string> = {}
    if (cached) headers['If-None-Match'] = cached.etag

    const res = await raw(url, { headers })
    if (res.status === 304 && cached) {
      return { ok: true, status: 304, json: async () => cached.body, headers: res.headers }
    }
    const body = await res.json()
    const etag = res.headers.get('etag')
    if (res.ok && etag) cache.set(url, { etag, body })
    return { ok: res.ok, status: res.status, json: async () => body, headers: res.headers }
  }
}

export interface CacheOptions {
  /** Minimum ms between real fetches; a call inside the window reuses the cache. */
  minIntervalMs?: number
  /** Serve the last good slate if a fetch throws. Default true. */
  staleOnError?: boolean
  /** Clock, injectable for tests. Default `Date.now`. */
  now?: () => number
}

/**
 * Throttle + stale-on-error around a `fetchSlate`. Calls within `minIntervalMs`
 * of the last successful fetch return the cached slate; a thrown fetch falls back
 * to the last good slate (unless none exists yet).
 */
export function cachedSlate(
  fetchSlate: () => Promise<ApiEvent[]>,
  opts: CacheOptions = {},
): () => Promise<ApiEvent[]> {
  const minIntervalMs = opts.minIntervalMs ?? 0
  const staleOnError = opts.staleOnError ?? true
  const now = opts.now ?? (() => Date.now())
  let last: { at: number; slate: ApiEvent[] } | null = null

  return async () => {
    if (last && now() - last.at < minIntervalMs) return last.slate
    try {
      const slate = await fetchSlate()
      last = { at: now(), slate }
      return slate
    } catch (err) {
      if (last && staleOnError) return last.slate
      throw err
    }
  }
}

export interface QuotaTracker {
  /** Feed it from the client's `onQuota` callback. */
  record(quota: Quota): void
  remaining(): number | null
  used(): number | null
  /** True once the remaining requests fall to/below `threshold`. */
  low(threshold: number): boolean
}

/** Accumulate the most recent quota figures the client reports. */
export function createQuotaTracker(): QuotaTracker {
  let remaining: number | null = null
  let used: number | null = null
  return {
    record(quota) {
      if (quota.remaining != null) remaining = quota.remaining
      if (quota.used != null) used = quota.used
    },
    remaining: () => remaining,
    used: () => used,
    low: (threshold) => remaining != null && remaining <= threshold,
  }
}
