# Hosting decision — VPS vs. the current Vercel + Supabase plan

_Research + a structured two-agent debate + the call. Written 2026-06-22 (branch
`claude/vps-hosting-debate-3ydw4i`). Points-only / play-money throughout — no payments,
no KYC, no licensing._

## TL;DR — the decision

**Stay on Vercel + Supabase. Do _not_ migrate to a self-managed VPS now.** Close the one
real architectural gap (and the live-odds gap) with **a single small always-on worker**
process — see [`worker/`](../worker/README.md) — while Vercel serves the static app and
Supabase keeps the multi-tenant data, auth, and realtime.

This is a _proportionate_ fix, not a half-measure: the only things serverless genuinely
can't do here are (a) hold the **Crash round-clock** and (b) drive **seconds-cadence live
odds**. Both are _compute_ that wants a persistent loop. Neither is a reason to repatriate
the **stateful money ledger** — the crown jewel — onto a box two part-time, non-ops
developers would own end-to-end.

Revisit the VPS question on **evidence**, against the trigger checklist below — not on the
ambition of the platform.

---

## The current architecture (what we're deciding about)

| Layer            | Today                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------- |
| Frontend         | React 18 + Vite static build → **Vercel** (git-push deploys, previews, CDN, auto HTTPS) |
| Data / auth / rt | **Supabase** — Postgres + Auth + Realtime + Storage. Multi-tenant via RLS (`0004_tenancy`) |
| API              | Vercel **serverless** routes: `/api/poll-odds`, `/api/run-promos`, `/api/fairness`, `/api/resolve-bet` — stateless |
| Money core       | Integer-cents credit/balance; server-authoritative RPCs (SECURITY DEFINER) in Supabase |
| Fairness         | Stateless **derived vault** (`serverSeed = HMAC(secret, commitId)`) — works on cold starts, no DB |
| Default          | "Off by default" — with no env keys the whole app runs on localStorage + mock odds      |

DimeBag is **not a single app** — it's a **white-label, multi-tenant pay-per-head (PPH)
platform**: a 4-tier Manager → Master Agent → Agent → Player org, commission splits,
per-tenant branding/config, a ~42-tile operator console. Still points-only. That raises the
ceiling on future load, but multi-tenancy here is enforced by **Supabase Postgres + RLS** —
which is exactly how multi-tenant SaaS is built.

## The two things serverless genuinely can't do

1. **Crash round-clock.** Crash is server-authoritative by design: the server must run the
   round timer, tick the multiplier, and withhold the crash point until resolve. A stateless
   Vercel function can't hold a `setInterval`. (`docs/odds-and-fairness/provably-fair-server.md` marks the
   "server-timed Crash clock" as the open seam; `resolveCrash` is already built as the path it
   plugs into.)
2. **Seconds-cadence live odds.** The live feed polls **every ~4s** (live) / 30s (pre-match)
   (`docs/odds-and-fairness/live-odds.md`). A free external pinger (cron-job.org floor = 60s) **cannot** deliver
   that — it only buys near-real-time. True live odds need a persistent loop. (Vercel Cron is
   even slower: Hobby ≈ once/day, Pro = every minute.)

Both are **one shared worker's** job: the odds poller is shared market data (one poller serves
every tenant), and the Crash clock is one loop. See [`worker/`](../worker/README.md).

---

## The debate (two independent agents, judged)

Two agents argued opposite sides across three rounds (opening → rebuttal → a focused round on
the multi-tenant/PPH context). Condensed:

### PRO-VPS — strongest points
- You need an **always-on box regardless** (Crash + 4s odds), so the honest choice is "one
  VPS" vs. "Vercel + Supabase + a pinger + a worker + managed Postgres/Redis."
- **Flat cost**: a $5–20/mo box serves 1k or 1M requests at the same price and runs everything
  in one place; serverless multiplies per-service line items and scales cost with traffic.
- **No KYC / no payments / no licensing** removes the usual compliance reason for managed
  everything. The money core is already server-authoritative RPCs; fairness is stateless HMAC.
- The 4s poller **kills the "just use a free 1-min pinger" escape hatch** — a persistent loop
  is now mandatory, not optional.
- _Honest concession (final round):_ the multi-tenant RLS money ledger is the crown jewel and
  is Supabase's to keep — the new context "sharpens the worker case and weakens the
  full-migration case."

### STATUS-QUO — strongest points
- A stateless **256 MB worker ≠ owning a stateful production Postgres** that holds the money
  ledger. "One always-on process" and "one self-managed stateful server" are different
  decisions.
- Two **part-time, non-ops** devs would inherit SSH hardening, UFW, Fail2Ban, patching,
  reboots, Postgres backups/tuning/PITR, TLS, monitoring, incident response — **forever**, and
  none of it ships features. Stated schedule risk is the sportsbook/live-data lane, not hosting.
- **Multi-tenant RLS is a Supabase _strength_, not a VPS reason.** Self-hosting the tenant DB
  raises blast radius — a misconfig becomes a **cross-tenant data-leak**, not just downtime.
- The **cost math was the most expensive config**, not the baseline: odds cadence lives in the
  _caller_; a single shared worker (≈$4 or a free tier) covers it without Pro seats.
- **Migrate on evidence, not speculation.** Pre-launch = least information about real load;
  building "the architecture you'll provably need" now risks building the wrong thing first.
- A white-label platform onboarding operators makes **uptime/security more** load-bearing —
  which favors a managed platform over a hand-run box.

### The judgment

Status-quo wins the decisive exchange. The pro-VPS case rests on collapsing "one always-on
process" into "own a full stateful server" — and those aren't the same liability. The
multi-tenant PPH nature, which at first looks pro-VPS (more load, more always-on jobs),
actually **reinforces keeping the database managed**, because the asset you'd repatriate is a
multi-operator RLS-isolated ledger. Both agents — including PRO-VPS — converged there.

What did change from the naive "it's just a points app" framing: the platform is more
ambitious than it looks, so the **migration trigger is more likely to eventually fire**, and
when it does the cleanest move is a **consolidated always-on compute tier** (workers on one
box) with **Postgres still on Supabase** — not a big-bang whole-stack migration.

---

## The recommended shape

```
            Vercel (static app + stateless API)        Supabase (managed)
            ┌───────────────────────────────┐          ┌────────────────────────┐
  players ─▶│ React app · /api/fairness ·    │◀────────▶│ Postgres + RLS (tenants│
            │ /api/resolve-bet · /api/*       │          │ money ledger, odds     │
            └───────────────────────────────┘          │ cache) · Auth · Realtime│
                                                        └────────────┬───────────┘
                          one small always-on worker  ───────────────┘
                          (Railway / Fly / Supabase) :
                            • dual-rate odds poller (4s live / 30s pre-match)
                            • Crash round-clock → broadcast over Supabase Realtime
                          writes the cache & round state Supabase already publishes
```

The worker is **stateless compute**: if it dies, a supervisor restarts it and it rejoins from
the server-authoritative seed + the last good slate. It holds no durable money state.

## When to revisit the VPS (the trigger checklist)

Flip to a VPS — or, more likely, a **consolidated always-on compute tier with the DB still on
Supabase** — when **two or more** of these fire:

- [ ] Multiple real operators driving **sustained, predictable** load (where flat cost beats
      per-request).
- [ ] Always-on workers **multiply** (per-tenant pollers, a server-timed sportsbook feed,
      live-dealer sim, bet-ticker fan-out) into a "worker farm across 4 vendors."
- [ ] A measured **Vercel/Supabase bill** or a function-limit / WebSocket wall you can point at.
- [ ] You need infra control a managed platform won't give (custom networking, a colocated
      cache, residency).

Until then, the managed stack + one worker is the disciplined choice — it honors CLAUDE.md §6
("one service… don't add separate auth/realtime services") and §9 ("roll up incrementally").

## Pros & cons (summary)

**Stay on Vercel + Supabase + one shared worker — recommended**

- ✅ RLS is the right tool for multi-tenant isolation; managed backups/PITR on the ledger.
- ✅ Managed uptime/security — a stronger story for a white-label platform than 2 non-ops devs.
- ✅ Git-push deploys, previews, rollbacks, auto HTTPS/CDN; scale-to-zero fits pre-launch.
- ✅ One small worker covers _both_ always-on needs (Crash clock + 4s poller, shared).
- ⚠️ You _do_ need that persistent worker — serverless alone can't do either.
- ⚠️ Costs scale with traffic; sustained multi-tenant load could eventually favor flat cost.

**Migrate to a self-managed VPS — not now**

- ✅ Flat cost, native WebSockets, no cold starts; consolidates a _growing_ always-on tier.
- ✅ Compelling later, at sustained multi-tenant scale.
- ❌ Repatriating a multi-tenant RLS money ledger raises blast radius (cross-tenant leak).
- ❌ 2 part-time non-ops devs own patching/backups/PITR/incident response — wrong economy.
- ❌ Speculative pre-launch (zero operators, mock odds); migrate on evidence, not anticipation.

## Sources

- HostMyCode — _Vercel vs VPS Hosting 2026_; DeployWise — _Serverless vs VPS 2026_.
- Corelab / HostMyCode — _2026 VPS hardening checklists_ (SSH keys, UFW, Fail2Ban, unattended
  upgrades, offsite backups).
- Supabase pricing & RLS multi-tenancy docs.
- Repo: `docs/odds-and-fairness/provably-fair-server.md`, `docs/odds-and-fairness/odds-polling.md`, `docs/odds-and-fairness/live-odds.md`,
  `docs/operations/provisioning.md`, `docs/architecture/management-surface.md`, `docs/operations/pph-console-gap-report.md`.
