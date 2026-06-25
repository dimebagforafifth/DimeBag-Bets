/**
 * Dual-rate odds poller for the always-on worker.
 *
 * Vercel serverless can't hold a setInterval, so the deployed app's only schedule is a
 * once-a-day Vercel Cron backstop (docs/odds-and-fairness/odds-polling.md). True LIVE odds need a persistent
 * loop — that's this. It reuses the SAME cost-disciplined `runPollCycle()` the /api/poll-odds
 * route runs; nothing about pricing/grading/cache changes.
 *
 * Cost discipline is unchanged: `runPollCycle` only calls the real SGO/TheOddsAPI feed when
 * SGO_LIVE=1. In the default (mock) mode every cycle is a no-op refresh — the loop ticks but
 * burns zero vendor quota, so you can run the worker safely before wiring a real key.
 *
 * Dual-rate: live markets move every few seconds; the upcoming board barely moves and the API
 * budget is finite. We run TWO loops — a fast one and a slow one — at independent cadences.
 * (Splitting the cache write by live/pre-match slate is the `combineFeeds` / `filterSlate`
 * seam in `sportsdata/vendors`; until that's wired here, both loops run the same mock-safe
 * cycle and the faster cadence simply governs freshness. Marked TODO below.)
 */
import { runPollCycle, schedulePolling, type Scheduler } from '../lib/odds/index.js'
import { createRestOddsCache, type OddsCache } from '../lib/odds/index.js'
import { getServerEnv } from '../lib/env.js'

/** Fast cadence for in-play prices (ms). Override with LIVE_POLL_MS. Floored at 2s. */
function livePollMs(): number {
  const raw = getServerEnv().LIVE_POLL_MS
  return raw !== undefined ? Math.max(2000, raw) : 4000
}

/** Slow cadence for the upcoming board (ms). Override with PREMATCH_POLL_MS. Floored at 10s. */
function prematchPollMs(): number {
  const raw = getServerEnv().PREMATCH_POLL_MS
  return raw !== undefined ? Math.max(10_000, raw) : 30_000
}

function resolveCache(): { cache: OddsCache; label: string } {
  const rest = createRestOddsCache()
  if (rest) return { cache: rest, label: 'supabase' }
  // No Supabase → an in-memory cache so the loop still ticks (counts only), matching the
  // local poll scripts' behaviour.
  const memory: OddsCache = {
    async getOverrides() {
      return new Map()
    },
    async writeEvents() {},
    async writeMarkets() {},
    async writeSelections() {},
  }
  return { cache: memory, label: 'in-memory (no Supabase — counts only)' }
}

export interface OddsPollerHandle {
  stop(): void
}

export function startOddsPoller(log: (msg: string) => void = console.log): OddsPollerHandle {
  const { cache, label } = resolveCache()
  const live = livePollMs()
  const pre = prematchPollMs()
  log(`[odds] poller up — live=${live}ms pre-match=${pre}ms cache=${label}`)

  let liveN = 0
  let preN = 0

  const runCycle = async (tag: string, n: number) => {
    try {
      // TODO(sportsdata): split by isLiveApi/isUpcomingApi + combineFeeds so the fast loop only
      // re-fetches in-play events and the slow loop only the upcoming board (saves API quota).
      const r = await runPollCycle({ cache, allowMockRefresh: true })
      const c = r.counts
      const detail = r.ran
        ? `${c?.events ?? 0}e/${c?.markets ?? 0}m/${c?.selections ?? 0}s (${r.mode})`
        : `skip:${r.reason}`
      log(`[odds:${tag}] #${n} ${detail}`)
    } catch {
      // Never throw out of the loop — a transient feed/cache error must not kill the worker.
      // runPollCycle keeps the last good slate; we just log and keep ticking.
      log(`[odds:${tag}] #${n} cycle error (kept last good slate)`)
    }
  }

  const liveLoop: Scheduler = schedulePolling(() => runCycle('live', ++liveN), live)
  const preLoop: Scheduler = schedulePolling(() => runCycle('pre', ++preN), pre)

  return {
    stop() {
      liveLoop.stop()
      preLoop.stop()
      log('[odds] poller stopped')
    },
  }
}
