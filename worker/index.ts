/**
 * DimeBag-Bets — always-on worker entrypoint.
 *
 * The ONE persistent process the serverless app can't host. It runs two long-lived loops that
 * Vercel functions structurally can't (no setInterval across stateless invocations):
 *
 *   1. the dual-rate live-odds poller   (seconds cadence — a free pinger can't go below 60s)
 *   2. the server-authoritative Crash round-clock
 *
 * It holds NO durable money state: the ledger, auth, and realtime stay on Supabase. If this
 * process dies, a supervisor restarts it and it rejoins from the server-authoritative seed and
 * the last good odds slate — nothing is lost.
 *
 * Off by default: with no SGO_LIVE / Supabase / FAIRNESS_SECRET env, the poller runs mock
 * (zero quota) and the Crash clock logs its timeline instead of broadcasting — fully runnable
 * locally, byte-for-byte safe.
 *
 * Toggle either loop with RUN_ODDS_POLLER / RUN_CRASH_CLOCK (default both on). See
 * worker/README.md for deploy (Railway / Fly / a VPS systemd unit).
 */
import { startHealthServer } from './health.js'
import { startOddsPoller, type OddsPollerHandle } from './oddsPoller.js'
import { startCrashClock, type CrashClockHandle } from './crashClock.js'
import { getServerEnv, validateServerEnv } from '../lib/env.js'

function main(): void {
  // Startup gate: in production a missing FAIRNESS_SECRET or a malformed cadence aborts the
  // worker here (rather than later, mid-loop); locally it warns and falls back to safe defaults.
  validateServerEnv()
  console.log('[worker] starting DimeBag-Bets worker')
  const health = startHealthServer()

  // RUN_ODDS_POLLER / RUN_CRASH_CLOCK default on; off only when explicitly '0' / 'false'.
  const env = getServerEnv()
  let poller: OddsPollerHandle | undefined
  let crash: CrashClockHandle | undefined
  if (env.RUN_ODDS_POLLER) poller = startOddsPoller()
  if (env.RUN_CRASH_CLOCK) crash = startCrashClock()

  if (!poller && !crash) {
    console.warn('[worker] both loops disabled — running health-only')
  }

  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[worker] ${signal} — shutting down`)
    poller?.stop()
    crash?.stop()
    health.close()
    // Give in-flight broadcasts/cycles a moment, then exit.
    setTimeout(() => process.exit(0), 500)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main()
