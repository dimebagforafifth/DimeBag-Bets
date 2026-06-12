/**
 * The CENTRAL ingestion poller (CLAUDE.md §4, §6).
 *
 * Exactly ONE of these runs. It is the only thing in the system that talks to a vendor:
 * on a configurable cadence it pulls `provider.fetchSlate()`, normalizes it into our
 * internal `GameEvent[]` (via `sportsdata/map`), and hands the result to `onSlate` — the
 * cache writer. Everything player- and operator-facing then reads from that cache, so
 * player traffic NEVER triggers a vendor API call.
 *
 * Budget protection is built in: the pull is wrapped in `withBackoff` (exponential
 * slate-level backoff on failure), the loop self-schedules with setTimeout *after* each
 * pull completes (no interval drift), and when the vendor reports low remaining quota the
 * cadence widens automatically. Usage is reported after every pull for monitoring. The
 * clock/timer are injectable so it's testable without real time.
 */

import { mapSlate, type MapOptions } from './map.js'
import type { FeedHealth, GameEvent } from '../sportsbook/index.js'
import type { OddsFeedProvider, Quota } from './vendors/index.js'
import { withBackoff } from './vendors/index.js'

export interface IngestionOptions extends MapOptions {
  /** The single vendor source. Compose multiple vendors before this if you need to. */
  provider: OddsFeedProvider
  /** Receives each freshly normalized slate — wire the cache's `ingest` here. The ONLY
   *  writer of the cache. */
  onSlate: (events: GameEvent[]) => void
  /** Base poll cadence once started. Default 15s (typical odds-API budget). */
  intervalMs?: number
  /** When the vendor's remaining quota is at/below `lowQuota`, widen to this cadence to
   *  protect the budget. Default 2× intervalMs. */
  lowQuotaIntervalMs?: number
  /** Remaining-quota threshold that triggers the slow cadence. Default 50. */
  lowQuota?: number
  /** Reported the vendor's quota after each pull (e.g. a `createUsageLog().record`). */
  onUsage?: (vendor: string, quota: Quota | null) => void
  /** Notified on a failed pull (the cache keeps its last good slate). */
  onError?: (err: unknown) => void
  /** Injected timer (tests). Defaults to setTimeout/clearTimeout. */
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void
}

export interface IngestionPoller {
  /** Begin polling: pull immediately, then self-schedule. Idempotent. */
  start(): void
  /** Stop polling and discard any in-flight pull. */
  stop(): void
  /** Pull once now (used by the loop; handy in tests to step without a timer). */
  refresh(): Promise<void>
  getHealth(): FeedHealth
}

export function createIngestionPoller(opts: IngestionOptions): IngestionPoller {
  const intervalMs = opts.intervalMs ?? 15_000
  const lowQuotaIntervalMs = opts.lowQuotaIntervalMs ?? intervalMs * 2
  const lowQuota = opts.lowQuota ?? 50
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h))

  // The pull is wrapped once so backoff state persists across refreshes.
  const pull = withBackoff(() => opts.provider.fetchSlate(), { baseMs: Math.min(intervalMs, 5_000) })

  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  // Monotonic generation: only the latest pull may apply, and stop() invalidates any
  // in-flight one (same guard as httpFeed).
  let generation = 0
  let health: FeedHealth = { status: 'idle', lastUpdated: null }

  /** Cadence for the NEXT poll: widen when the vendor is running low on quota. */
  function nextDelay(): number {
    const remaining = opts.provider.usage()?.remaining ?? null
    return remaining != null && remaining <= lowQuota ? lowQuotaIntervalMs : intervalMs
  }

  function schedule(): void {
    if (!running) return
    if (timer != null) clearTimer(timer)
    timer = setTimer(() => void tick(), nextDelay())
  }

  async function refresh(): Promise<void> {
    const mine = ++generation
    try {
      const raw = await pull()
      if (mine !== generation) return // superseded or stopped mid-flight
      opts.onUsage?.(opts.provider.name, opts.provider.usage())
      opts.onSlate(mapSlate(raw, { bookmaker: opts.bookmaker }))
      health = { status: 'live', lastUpdated: Date.now() }
    } catch (err) {
      if (mine !== generation) return
      opts.onError?.(err)
      health = {
        status: health.lastUpdated != null ? 'reconnecting' : 'error',
        lastUpdated: health.lastUpdated,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /** One loop step: pull, then schedule the next based on the post-pull quota. */
  async function tick(): Promise<void> {
    await refresh()
    schedule()
  }

  return {
    start() {
      if (running) return
      running = true
      if (health.lastUpdated == null) health = { status: 'connecting', lastUpdated: null }
      void tick()
    },
    stop() {
      running = false
      generation += 1 // invalidate any in-flight pull
      if (timer != null) clearTimer(timer)
      timer = null
      health = { status: 'idle', lastUpdated: health.lastUpdated }
    },
    refresh,
    getHealth: () => health,
  }
}
