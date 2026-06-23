# Live & Pre-Match Odds — wiring a real API

The sportsbook reads its slate from a single seam — `SportsbookFeed` (`sportsbook/provider.ts`) — so swapping the demo data for a real odds/scores API is a **one-line change where the store is created**. Nothing in pricing, settlement, the live model, or the UI changes.

```
vendor API ──▶ createOddsApiSlate ──▶ createHttpFeed ──▶ SportsbookFeed ──▶ createStore
 (odds+scores)   (sportsdata/vendors)   (sportsdata)        (the seam)       (one balance)
```

## The pieces

| Layer | Where | Job |
|---|---|---|
| DTO + mapping | `sportsdata/types.ts`, `map.ts` | vendor JSON → internal `GameEvent` (the only place that knows vendor field names) |
| Polling feed | `sportsdata/httpFeed.ts` | poll a `fetchSlate()`, map it, push updates; keeps the last good slate on a failed poll |
| **Vendor client** | `sportsdata/vendors/theOddsApi.ts` | build the real **pre-match odds** + **live scores** requests, merge them, track quota |
| **Feed tools** | `sportsdata/vendors/feedTools.ts` | split into fast live / slow pre-match feeds and merge them into one |
| **Live UI** | `sportsbook/ui/live/` | LIVE/FINAL/kickoff badge, running score, odds-movement tick, kickoff countdown, feed-status chip |

## Backend: attach the API

The odds endpoint already matches our `ApiEvent` shape; the client also pulls the `/scores` endpoint and **merges live scores by event id**, so a game flips `upcoming → live → final` and settlement fires automatically.

```ts
import { createStore } from 'sportsbook'
import { createHttpFeed } from 'sportsdata'
import { createOddsApiSlate } from 'sportsdata/vendors'

const slate = createOddsApiSlate({
  config: {
    apiKey: process.env.ODDS_API_KEY!,
    sportKeys: ['basketball_nba', 'americanfootball_nfl'],
    // regions 'us', markets 'h2h,spreads,totals', oddsFormat 'american' by default
  },
  onQuota: (q) => console.log(`${q.remaining} requests left`),
})

const feed = createHttpFeed({ fetchSlate: slate, intervalMs: 8000 })
const store = createStore(account, { feed })
```

### Dual-rate: live fast, pre-match slow

Live prices move every few seconds; the upcoming board barely moves — and the API budget is finite. Run two feeds and merge them:

```ts
import { createHttpFeed } from 'sportsdata'
import { createOddsApiSlate, filterSlate, isLiveApi, isUpcomingApi, combineFeeds } from 'sportsdata/vendors'

const slate = createOddsApiSlate({ config })
const live = createHttpFeed({ fetchSlate: filterSlate(slate, isLiveApi),     intervalMs: 4000 })
const pre  = createHttpFeed({ fetchSlate: filterSlate(slate, isUpcomingApi), intervalMs: 30000 })

const feed = combineFeeds(live, pre) // union by event id; live listed last wins on a clash
const store = createStore(account, { feed })
```

`combineFeeds` re-emits the merged slate whenever either child updates, and `start`/`stop` fan out to both (idempotent on repeat `start`).

### Stretching the API quota

Odds APIs bill per request. Three composable wrappers protect the budget:

```ts
import { createOddsApiSlate, etagFetch, cachedSlate, createQuotaTracker } from 'sportsdata/vendors'

const quota = createQuotaTracker() // feed the status UI; back off when low

const slate = cachedSlate(
  createOddsApiSlate({
    config,
    fetchFn: etagFetch(fetch), // 304 Not Modified → cached body, no re-download
    onQuota: (q) => quota.record(q),
  }),
  { minIntervalMs: 5000 }, // dedupe rapid polls; serve last good slate on error
)

const feed = createHttpFeed({ fetchSlate: slate, intervalMs: 4000 })
// quota.remaining() / quota.low(50) → drive <FeedStatus/> or pause polling
```

- **`etagFetch`** sends `If-None-Match` and serves the cached body on a `304`.
- **`cachedSlate`** throttles to one real fetch per window and falls back to the last good slate on a transient error.
- **`createQuotaTracker`** accumulates the vendor's remaining/used headers for the status chip and back-off decisions.

## Frontend: show live vs pre-match

The components in `sportsbook/ui/live/` are pure props-in primitives — drop them into the sportsbook view:

```tsx
import { LiveBadge, LiveScore, OddsTick, KickoffCountdown, FeedStatus } from 'sportsbook/ui/live'

<LiveBadge event={event} />              {/* LIVE · Q3 / FINAL / "Sun 7:30 PM" */}
<LiveScore event={event} />              {/* 58–55 when in play */}
<OddsTick value={decimal} />             {/* flashes ▲/▼ when the line moves */}
<KickoffCountdown kickoff={isoTime} />   {/* "Starts in 12m" */}
<FeedStatus connected lastUpdated={ts} quotaRemaining={480} />
```

## Swapping vendors

Only `sportsdata/map.ts` (and a vendor client like `theOddsApi.ts`) know a vendor's field names. To use a different provider, write a `fetchSlate` that returns `ApiEvent[]` (or adjust the mapping) — the feed, store, pricing, grading, and UI are untouched.
