# `worker/` — the one always-on process

This is the single persistent process the serverless app can't host. It runs the two
long-lived loops Vercel functions structurally can't (a stateless function can't hold a
`setInterval` across invocations):

| Loop                         | Why it can't be serverless                                                    |
| ---------------------------- | ----------------------------------------------------------------------------- |
| **Dual-rate odds poller**    | Live odds want ~4s cadence; a free pinger floors at 60s and Vercel Cron at 1/day (Hobby). |
| **Crash round-clock**        | Must run the round timer and withhold the crash point until bust (server-authoritative). |

It holds **no durable money state** — the ledger, auth, and realtime stay on Supabase. If the
process dies, your host restarts it and it rejoins from the server-authoritative fairness seed
and the last good odds slate. Nothing is lost. See `docs/research-vps-vs-serverless.md` for
why this worker (not a VPS migration) is the right call.

## Files

| File            | Role                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| `index.ts`      | Entrypoint: starts the health server + both loops; graceful shutdown.   |
| `oddsPoller.ts` | Dual-rate poller — reuses the same mock-safe `runPollCycle()` as the route. |
| `crashClock.ts` | Server-authoritative Crash round loop → broadcasts over Supabase Realtime. |
| `health.ts`     | `GET /health` → 200 (liveness for the host / uptime monitor).           |
| `supabase.ts`   | Service-role client (writes the cache, publishes Realtime).             |
| `Dockerfile`    | Container image for Railway / Fly / any Docker host.                    |

## Off by default

With **no** env set the worker is fully runnable and harmless: the poller runs in **mock**
mode (zero vendor quota) against an in-memory cache, and the Crash clock logs its timeline to
the console instead of broadcasting. This mirrors the rest of the app's "off by default"
invariant — you can run it locally today.

## Run it locally

```bash
npm install
npm run worker          # mock poller + console-logged Crash timeline
npm run worker:dev      # same, with --watch
```

You'll see `[health] listening on :8080`, `[odds:live] …`, and `[crash] round_open …` lines.
`curl localhost:8080/health` → `{ "ok": true, ... }`.

## Environment

All optional — set what you want live. (Server-only secrets; never put the service-role key or
`FAIRNESS_SECRET` in a browser build.)

| Var                         | Effect                                                                  |
| --------------------------- | ----------------------------------------------------------------------- |
| `SUPABASE_URL`              | Enables writing the real odds cache + Realtime broadcast.               |
| `SUPABASE_SERVICE_ROLE_KEY` | Same — service-role, RLS-bypassing. Server-only.                        |
| `SGO_LIVE=1`                | Poll the **real** odds feed (else mock, zero quota).                    |
| `SPORTS_ODDS_API_KEY_HEADER`| The odds vendor key (needed when `SGO_LIVE=1`). Server-only.            |
| `FAIRNESS_SECRET`           | Seeds the Crash authority. Unset → a flagged dev fallback (local only). |
| `LIVE_POLL_MS`              | Live-market poll cadence (default 4000, floor 2000).                    |
| `PREMATCH_POLL_MS`          | Upcoming-board poll cadence (default 30000, floor 10000).               |
| `CRASH_BETTING_MS` / `CRASH_TICK_MS` / `CRASH_COOLDOWN_MS` | Round pacing (default 5000 / 100 / 3000). |
| `RUN_ODDS_POLLER=0`         | Disable the poller loop (run Crash only).                               |
| `RUN_CRASH_CLOCK=0`         | Disable the Crash loop (run the poller only).                           |
| `PORT`                      | Health-server port (platform usually injects this; default 8080).       |

## Deploy — three options, easiest first

### A. Railway (recommended to start — managed, ~free/cheap)

1. New project → **Deploy from GitHub repo** → pick this repo.
2. Settings → set **Start Command** to `npm run worker` (or let it use the `Dockerfile`).
3. **Variables** → add the env from the table above (at minimum `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `FAIRNESS_SECRET`; add `SGO_LIVE=1` + the key for real odds).
4. **Health check path** → `/health`.
5. Deploy. Railway keeps it running, restarts on crash, and streams logs. Done.

### B. Fly.io (also managed; nice if you want a region close to players)

```bash
fly launch --no-deploy        # generates fly.toml; choose a region
fly secrets set SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… FAIRNESS_SECRET=… \
                SGO_LIVE=1 SPORTS_ODDS_API_KEY_HEADER=…
fly deploy                     # builds worker/Dockerfile
```

In `fly.toml`, point the build at `worker/Dockerfile`, set the internal port to `8080`, and
add an HTTP health check on `/health`. One shared small VM (e.g. `shared-cpu-1x`, 256MB) is
plenty.

### C. A bare VPS (only once the trigger checklist in the research doc fires)

If you ever do run your own box, the worker is a **systemd** unit — not a babysitting job:

```ini
# /etc/systemd/system/dimebag-worker.service
[Unit]
Description=DimeBag-Bets worker (odds + crash clock)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/dimebag
EnvironmentFile=/etc/dimebag/worker.env     # the vars above, 0600, root-only
ExecStart=/usr/bin/npm run worker
Restart=always
RestartSec=3
User=dimebag                                # non-root

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dimebag-worker
sudo journalctl -u dimebag-worker -f        # logs
```

Pair it with the standard "first 30 minutes" hardening (SSH keys only, UFW allowing 22/80/443,
Fail2Ban, unattended-upgrades) — but per the research doc, prefer A or B until you have
real-load evidence.

## How it plugs into the existing code (no app changes required)

- **Odds:** reuses `runPollCycle()` / `schedulePolling()` from `lib/odds` — the exact
  cost-disciplined cycle `/api/poll-odds` runs. The browser's `connectOddsCache()` already
  reads the cache + Realtime, so live prices "just appear" once the worker fills it.
- **Crash:** uses the fairness authority (`createDerivedVault`) + `crashPointFromSeeds` + the
  `curve.ts` multiplier — same math as the game and `api/fairness`'s `resolveCrash`. The game's
  client clock (today marked INTERIM) becomes a **subscriber** to the `crash:lobby` broadcast.

## Open seams (intentional, marked `TODO` in code)

1. **Per-slate dual-rate.** Split the fast/slow loops by live vs upcoming events via
   `sportsdata/vendors` `filterSlate` + `combineFeeds` so the 4s loop only re-fetches in-play
   games (saves API quota). Today both loops run the same mock-safe cycle.
2. **Bind wagers to the round server-side.** Record each accepted Crash wager's
   `(commitId, clientSeed, nonce)` at placement so the standalone reveal is fully grind-proof —
   lands with the Supabase money-RPC lane.
3. **Settle on bust.** Trigger settlement of a round's open wagers through `core` /
   `api/resolve-bet` when the clock broadcasts `bust`.
4. **Durable rounds (optional).** Swap the derived vault for `createStoredVault(store)` and
   persist round history to a `crash_rounds` table (same interface, no caller change).

> `worker/` is in `tsconfig.json`'s `include`, so it's type-checked by the build/CI like every
> other source dir (the repo's tsconfig-coverage guard requires this). It is **not** picked up by
> the app's Vite build or the Vitest suite — it only runs when you start it (`npm run worker`).
