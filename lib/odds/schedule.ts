/**
 * Scheduled polling — the layer that keeps the odds cache fresh on a deployed app.
 *
 * Two pieces:
 *  - `runPollCycle()` runs ONE cost-disciplined cycle (the unit a cron / route / loop
 *    triggers). It NEVER touches the real SGO feed unless SGO_LIVE=1, so a schedule that
 *    fires in the default (mock) mode burns zero quota.
 *  - `schedulePolling()` runs a cycle on a repeating interval for a long-running worker or
 *    the local dev loop. (NOT for Vercel serverless, which is stateless — there a Vercel
 *    Cron / external pinger hits the poll route instead; see api/poll-odds.ts.)
 *
 * Mock stays the committed default: with SGO_LIVE unset, the deployed route no-ops.
 */

import { MockProvider } from './providers/MockProvider.js'
import { Poller, selectProvider, type OddsCache, type PollResult } from './poller.js'
import { createRestOddsCache } from './rest-cache.js'
import type { OddsFeedProvider } from './contract.js'

type Env = Record<string, string | undefined>

function ambientEnv(): Env {
  return (globalThis as { process?: { env?: Env } }).process?.env ?? {}
}

export const DEFAULT_POLL_INTERVAL_SECONDS = 60
/** Floor so a misconfigured tiny interval can't hammer SGO / the cache. */
export const MIN_POLL_INTERVAL_SECONDS = 15

/** The poll interval (seconds) from POLL_INTERVAL_SECONDS, clamped to a sane floor. */
export function pollIntervalSeconds(env: Env = ambientEnv()): number {
  const raw = Number(env.POLL_INTERVAL_SECONDS)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_POLL_INTERVAL_SECONDS
  return Math.max(MIN_POLL_INTERVAL_SECONDS, Math.floor(raw))
}

/** Live mode is opt-in: only SGO_LIVE=1 (or 'true') talks to the real feed. */
export function isLiveMode(env: Env = ambientEnv()): boolean {
  return env.SGO_LIVE === '1' || env.SGO_LIVE === 'true'
}

export interface PollCycleResult {
  mode: 'live' | 'mock'
  /** Whether a poll actually ran (provider was called + cache written). */
  ran: boolean
  /** Why it didn't run, when ran === false. */
  reason?: string
  provider?: string
  counts?: PollResult
}

export interface RunPollCycleOptions {
  env?: Env
  /** Inject a cache (tests / local loop). Default: a REST Supabase cache from env. */
  cache?: OddsCache
  /** Inject a provider (tests). Default: selectProvider() (mock-safe) in live mode. */
  provider?: OddsFeedProvider
  /**
   * In MOCK mode, refresh the cache from the MockProvider instead of no-opping. Off by
   * default (the deployed cron stays a true no-op in mock); the LOCAL dev loop turns it
   * on so you can watch the schedule tick without a key. NEVER calls the real feed.
   */
  allowMockRefresh?: boolean
  leagues?: readonly string[]
  now?: () => string
  /** Hook for a league that fails to poll (e.g. a plan-gated EPL/UFC 4xx). Defaults to a
   *  console.warn so a deploy SEES which leagues didn't resolve; the cycle skips them and
   *  caches the rest. */
  onLeagueError?: (league: string, error: unknown) => void
}

/**
 * Run ONE poll cycle:
 *  - mock mode (default): returns {mode:'mock', ran:false} — no feed call, no quota — unless
 *    `allowMockRefresh`, in which case it refreshes from the MockProvider (still no SGO).
 *  - live mode (SGO_LIVE=1): SGO via selectProvider() → normalize → write the cache.
 *    Skips (ran:false) when no cache is configured, so a misconfig never throws in a cron.
 */
export async function runPollCycle(opts: RunPollCycleOptions = {}): Promise<PollCycleResult> {
  const env = opts.env ?? ambientEnv()
  const live = isLiveMode(env)

  if (!live) {
    if (!opts.allowMockRefresh) {
      return { mode: 'mock', ran: false, reason: 'SGO_LIVE not set — not polling the real feed' }
    }
    const provider = opts.provider ?? new MockProvider() // explicitly mock — never SGO
    const cache = opts.cache ?? createRestOddsCache(env)
    if (!cache) return { mode: 'mock', ran: false, reason: 'no cache configured' }
    const counts = await poll(provider, cache, opts)
    return { mode: 'mock', ran: true, provider: provider.name, counts }
  }

  const provider = opts.provider ?? selectProvider() // SGO when live + key, else mock
  const cache = opts.cache ?? createRestOddsCache(env)
  if (!cache) {
    return {
      mode: 'live',
      ran: false,
      reason: 'no Supabase cache configured (SUPABASE_URL + service key required)',
      provider: provider.name,
    }
  }
  const counts = await poll(provider, cache, opts)
  return { mode: 'live', ran: true, provider: provider.name, counts }
}

function poll(
  provider: OddsFeedProvider,
  cache: OddsCache,
  opts: RunPollCycleOptions,
): Promise<PollResult> {
  const onLeagueError =
    opts.onLeagueError ??
    ((league: string, error: unknown) =>
      console.warn(`[odds] skipped league ${league} (likely plan-gated): ${String(error)}`))
  const poller = new Poller({
    provider,
    cache,
    onLeagueError,
    ...(opts.leagues ? { leagues: opts.leagues } : {}),
    ...(opts.now ? { now: opts.now } : {}),
  })
  return poller.pollOnce()
}

export interface Scheduler {
  stop(): void
}

/**
 * Run `cycle` immediately and then every `intervalMs`. Never overlaps a slow cycle, and a
 * thrown cycle is swallowed (the last good cache stands). Returns a stop handle.
 */
export function schedulePolling(cycle: () => Promise<unknown>, intervalMs: number): Scheduler {
  let running = false
  let stopped = false
  const tick = async (): Promise<void> => {
    if (running || stopped) return
    running = true
    try {
      await cycle()
    } catch {
      /* a failed cycle keeps the last good cache — never throw out of the loop */
    } finally {
      running = false
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), intervalMs)
  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}
