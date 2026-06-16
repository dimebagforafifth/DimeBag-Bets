/**
 * DEV snapshot producer — poll the real SGO feed ONCE and write a static slate the
 * browser loads (public/dev-odds.json), so a local demo shows REAL current games with
 * NO Supabase project. Pair with `.env.local` → `VITE_SGO_SNAPSHOT_URL=/dev-odds.json`.
 *
 *   SGO_LIVE=1 SPORTS_ODDS_API_KEY_HEADER=$(cat /tmp/sgo.key) npm run dev:snapshot   # REAL
 *   npm run dev:snapshot                                                            # mock (no key)
 *
 * Only the verified-working SGO leagues are polled (EPL/UFC currently 400 on the league
 * id — see the live-test report). The key is read from env, never logged. Output is
 * gitignored (data, not code).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { SGOProvider, isLiveMode } from '../lib/odds/index.js'
import { mockSlate } from '../app/book/mockBook.js'
import type { NormalizedEvent } from '../lib/odds/contract.js'

const WORKING_LEAGUES = ['NBA', 'MLB', 'NHL', 'NFL'] // EPL/UFC reject (400) until league ids are fixed
const OUT = 'public/dev-odds.json'
const PER_LEAGUE = 6 // conserve free-tier objects (SGO bills per event)

async function realSlate(): Promise<NormalizedEvent[]> {
  const provider = new SGOProvider()
  const events: NormalizedEvent[] = []
  for (const league of WORKING_LEAGUES) {
    try {
      events.push(
        ...(await provider.listEvents([league], { includeAltLines: true, limit: PER_LEAGUE })),
      )
    } catch (e) {
      console.warn(`[dev:snapshot] ${league} skipped: ${(e as Error).message}`)
    }
  }
  return events
}

const live = isLiveMode()
const events = live ? await realSlate() : mockSlate()
mkdirSync('public', { recursive: true })
writeFileSync(OUT, JSON.stringify(events))
const withOdds = events.filter((e) => e.markets.some((m) => m.selections.length)).length
console.log(
  `[dev:snapshot] wrote ${events.length} events (${withOdds} with odds) to ${OUT} — ${live ? 'LIVE SGO' : 'mock'}`,
)
