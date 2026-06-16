/**
 * LOCAL SCHEDULED LOOP — run the poll cycle on a repeating interval so you can watch the
 * cache refresh before deploying. Interval = POLL_INTERVAL_SECONDS (default 60). Run:
 *
 *   SGO_LIVE=1 SPORTS_ODDS_API_KEY_HEADER=… POLL_INTERVAL_SECONDS=30 npm run poll:loop
 *   npm run poll:loop                                       # mock refresh on a loop (no quota)
 *
 * Ctrl-C to stop. (This is the dev/worker form of scheduling; the DEPLOYED app schedules
 * via Vercel Cron / an external pinger hitting /api/poll-odds — serverless can't hold a
 * setInterval. See docs/odds-polling.md.)
 */
import {
  runPollCycle,
  schedulePolling,
  pollIntervalSeconds,
  isLiveMode,
} from '../lib/odds/index.js'
import { resolveCache } from './poll-shared.js'

const { cache, label } = resolveCache()
const seconds = pollIntervalSeconds()
console.log(
  `[poll:loop] every ${seconds}s — mode=${isLiveMode() ? 'LIVE (SGO)' : 'mock'}  cache=${label}  (Ctrl-C to stop)`,
)

let n = 0
const scheduler = schedulePolling(async () => {
  n += 1
  const r = await runPollCycle({ cache, allowMockRefresh: true })
  const c = r.counts
  const detail = r.ran
    ? `${c?.events} events / ${c?.markets} markets / ${c?.selections} selections (${r.mode})`
    : `skipped: ${r.reason}`
  console.log(`[poll:loop] cycle ${n} @ ${new Date().toISOString()} — ${detail}`)
}, seconds * 1000)

process.on('SIGINT', () => {
  scheduler.stop()
  console.log('\n[poll:loop] stopped.')
  process.exit(0)
})
