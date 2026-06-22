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

const on = (name: string) => process.env[name] !== '0' && process.env[name] !== 'false'

function main(): void {
  console.log('[worker] starting DimeBag-Bets worker')
  const health = startHealthServer()

  let poller: OddsPollerHandle | undefined
  let crash: CrashClockHandle | undefined
  if (on('RUN_ODDS_POLLER')) poller = startOddsPoller()
  if (on('RUN_CRASH_CLOCK')) crash = startCrashClock()

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
