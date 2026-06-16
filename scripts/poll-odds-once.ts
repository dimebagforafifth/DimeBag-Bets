/**
 * SNAPSHOT MODE — poll real games ONCE, write the cache, stop. Safe for a shared demo:
 * the app then shows real games/odds from the cache without continuously burning quota
 * (games just won't tick live). Run:
 *
 *   SGO_LIVE=1 SPORTS_ODDS_API_KEY_HEADER=… npm run poll:once     # real snapshot
 *   npm run poll:once                                             # mock refresh (no quota)
 *
 * (Writes to Supabase when SUPABASE_URL + service key are set; otherwise logs counts.)
 */
import { runPollCycle, isLiveMode } from '../lib/odds/index.js'
import { resolveCache } from './poll-shared.js'

const { cache, label } = resolveCache()
console.log(`[poll:once] mode=${isLiveMode() ? 'LIVE (SGO)' : 'mock'}  cache=${label}`)
const result = await runPollCycle({ cache, allowMockRefresh: true })
console.log('[poll:once]', JSON.stringify(result))
