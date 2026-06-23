# Scheduled odds polling

How the SGO odds cache is kept fresh on a deployed app, and how to run it locally.

## The shape

The browser never polls a vendor (that would leak the key). Instead:

```
scheduler  →  /api/poll-odds  →  runPollCycle()  →  SGOProvider → normalize → Supabase cache
   (cron/pinger/loop)                                                              │
                                                          connectOddsCache() (browser) ◀┘  (realtime/REST)
```

`/api/poll-odds` runs ONE cycle per hit. Vercel functions are **stateless** — they can't
hold a `setInterval` — so the _schedule_ lives outside the function: a cron or pinger hits
the route on an interval. (`schedulePolling()` exists for a long-running worker / the local
loop, not for serverless.)

## Cost discipline (mock is the default)

`runPollCycle()` only calls the real SGO feed when **`SGO_LIVE=1`**. With it unset (the
committed default) the route is a **no-op** — the cron can fire harmlessly and burn **zero**
quota. Live mode also needs `SPORTS_ODDS_API_KEY_HEADER` (server-side) and a Supabase
service key to write the cache; missing either → the cycle safely **skips** (never throws).

`POLL_INTERVAL_SECONDS` (default 60, floor 15) sets the local-loop / pinger cadence.

## Deploying the schedule on Vercel — and the tier caveat

`vercel.json` ships a cron at `/api/poll-odds`. **Vercel cron frequency is tier-limited**
(verify current limits in Vercel's docs — they change):

| Tier             | Cron frequency                                                 | Good enough to "tick live"? |
| ---------------- | -------------------------------------------------------------- | --------------------------- |
| **Hobby (free)** | ~**once per day** (sub-daily schedules are rejected/throttled) | ❌ no                       |
| **Pro**          | down to **every minute**                                       | ✅ yes                      |

So the committed cron is a **deploy-safe daily backstop** (`0 12 * * *`). For real live
updates:

- **Pro:** change the schedule to e.g. `*/2 * * * *` (every 2 min).
- **Free tier (recommended):** point an **external pinger** at the route on an interval —
  e.g. **cron-job.org** (down to 1-minute, free), UptimeRobot (5-min), or a GitHub Actions
  scheduled workflow (≈5-min min). Set `CRON_SECRET` and have the pinger send
  `Authorization: Bearer <CRON_SECRET>`.
- **Worker:** run `schedulePolling()` (or `npm run poll:loop`) on any always-on host
  (Railway/Fly/a small VM) — not Vercel.

## Modes

- **Live (continuous):** `SGO_LIVE=1` + key + Supabase + a scheduler hitting the route →
  the cache refreshes every interval; games tick live in the book.
- **Snapshot (safe demo):** poll **once**, cache it, stop — real games show from cache
  without continuous polling (they just don't tick). `npm run poll:once` (or hit the route
  once with the cron/pinger disabled).
- **Mock (default):** nothing set → built-in mock slate, no feed calls ever.

## Run the loop locally

```bash
# Watch the cache refresh on a loop (real SGO):
SGO_LIVE=1 SPORTS_ODDS_API_KEY_HEADER=… POLL_INTERVAL_SECONDS=30 npm run poll:loop

# One real snapshot then stop:
SGO_LIVE=1 SPORTS_ODDS_API_KEY_HEADER=… npm run poll:once

# No key? Both run in mock-refresh mode (no quota) so you can watch the schedule tick:
npm run poll:loop
```

Without Supabase configured, the scripts use an in-memory cache and just log per-cycle
counts — enough to watch the schedule fire. With `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
set, they write the real cache the browser reads.
