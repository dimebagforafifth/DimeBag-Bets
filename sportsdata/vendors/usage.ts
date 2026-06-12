/**
 * Request-usage log for the odds feed (CLAUDE.md §4, §6).
 *
 * Odds APIs bill per request, so we keep a rolling, per-vendor record of the quota each
 * vendor reports (remaining / used) over time — the data the operator's feed-health
 * panel reads to watch quota burn and the central poller reads to back off before it
 * runs the budget dry. Capped so it can't grow without bound; the clock is injectable
 * for tests.
 */

import type { Quota } from './theOddsApi.js'

export interface UsageEntry {
  vendor: string
  /** Epoch ms the quota was reported. */
  at: number
  remaining: number | null
  used: number | null
}

export interface UsageLog {
  /** Record a vendor's reported quota (no-op if the vendor reports nothing). */
  record(vendor: string, quota: Quota | null, at?: number): void
  /** The full log, oldest first (stable copy). */
  entries(): UsageEntry[]
  /** The most recent entry overall, or for one vendor. */
  latest(vendor?: string): UsageEntry | null
  /** Estimated requests used over the window for a vendor (max `used` − min `used`),
   *  or the latest `used` when only one reading exists. */
  burn(vendor: string): number | null
  clear(): void
}

export function createUsageLog(opts: { max?: number; now?: () => number } = {}): UsageLog {
  const max = opts.max ?? 500
  const now = opts.now ?? (() => Date.now())
  let log: UsageEntry[] = []

  return {
    record(vendor, quota, at) {
      if (!quota || (quota.remaining == null && quota.used == null)) return
      log.push({ vendor, at: at ?? now(), remaining: quota.remaining, used: quota.used })
      if (log.length > max) log = log.slice(-max)
    },
    entries: () => log.slice(),
    latest(vendor) {
      for (let i = log.length - 1; i >= 0; i--) {
        if (!vendor || log[i].vendor === vendor) return log[i]
      }
      return null
    },
    burn(vendor) {
      const used = log.filter((e) => e.vendor === vendor && e.used != null).map((e) => e.used as number)
      if (used.length === 0) return null
      if (used.length === 1) return used[0]
      return Math.max(...used) - Math.min(...used)
    },
    clear() {
      log = []
    },
  }
}
