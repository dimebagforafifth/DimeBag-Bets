# Provisioning DimeBag-Bets — the human steps (for the founder)

Everything in the codebase is **off by default**: with no environment keys the app runs
entirely on `localStorage` + the in-process `core` + the built-in **mock** odds slate, and
behaves byte-for-byte as it always has. This guide is the **manual, human-only** part —
creating the Supabase project, getting keys, and flipping the switches — that turns the
server backend on. Claude can't (and shouldn't) do these steps; they involve real accounts
and secrets.

> **What's already wired in code (no work needed):** the env-gated store selector, the
> server-authoritative money RPCs, RLS, the odds cache + poller, **Supabase Realtime**, the
> **Supabase Auth adapter**, and the two cron routes (`/api/poll-odds`, `/api/run-promos`).
> They activate the moment the matching keys are present. The only code-side follow-ups are
> the two **TODO(api)** seams called out in step 7.

---

## 1. Create the Supabase project

1. Create a project at <https://supabase.com>. Pick a region near your players.
2. From **Project Settings → API**, copy three values:
   - **Project URL** — `https://<project>.supabase.co`
   - **anon public key** — safe for the browser (RLS gatekeeps it)
   - **service_role key** — **server-only, full bypass of RLS.** Never put it in the browser
     bundle or commit it.

## 2. Apply the database schema

The schema is the ordered, canonical migration set in `supabase/migrations/`
(`0001` → `0005`; see `supabase/README.md` for what each does and the reconciliation note).

```bash
# with the Supabase CLI, linked to your project:
supabase db push                 # applies 0001 … 0005 in order

# or straight psql against the project's connection string:
psql "$DATABASE_URL" -f supabase/migrations/0001_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_rls.sql
psql "$DATABASE_URL" -f supabase/migrations/0003_money_rpcs.sql
psql "$DATABASE_URL" -f supabase/migrations/0004_tenancy.sql
psql "$DATABASE_URL" -f supabase/migrations/0005_odds_cache.sql
```

This creates the money tables (`accounts`/`wagers`/`ledger`/`settlements`), the org + VIP
read-models, the `kv_documents` blob store, the six SECURITY DEFINER money RPCs, the
odds cache (`odds_events`/`odds_markets`/`odds_selections`, added to the `supabase_realtime`
publication), and the tenant columns.

## 3. Set environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (and, for local dev, in
a gitignored `.env.local` — copy `.env.example`). Either the bare or `VITE_`-prefixed name
works; the browser build needs the `VITE_` ones.

| Variable | Where | Purpose |
|----------|-------|---------|
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | both | project URL — switches the data layer, auth, and realtime on |
| `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` | both | browser/client key (RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | lets the poll route write the odds cache (RLS blocks anon writes) |
| `SGO_LIVE` | server | `1` to poll the real SGO odds feed; unset = mock (no quota) |
| `SPORTS_ODDS_API_KEY_HEADER` | **server only** | the SGO API key — never commit |
| `POLL_INTERVAL_SECONDS` | server | local-loop / pinger cadence (≥15; default 60) |
| `CRON_SECRET` | server | guards `/api/poll-odds` **and** `/api/run-promos` |
| `SUPABASE_AUTH_EMAIL_DOMAIN` | both (optional) | synthetic-email domain for username login (default `users.dimebag.local`) |
| `FAIRNESS_SECRET` | **server only** | server seed authority secret; set a strong random value before production |
| `FAIRNESS_COMMIT_RATE_LIMIT_MAX` | server | max `/api/fairness` `commit` calls per limiter window (default `20`) |
| `FAIRNESS_COMMIT_RATE_LIMIT_WINDOW_MS` | server | commit limiter window in milliseconds (default `60000`) |

> **Rotate first:** the SGO key and any GitHub token used during development have been in
> chat/transcripts — rotate them before going live.

Set the two `FAIRNESS_COMMIT_RATE_LIMIT_*` values explicitly in Vercel before player auth is
enabled. The current serverless limiter is IP-keyed and in-memory per function instance; it is
the lightweight guard for the existing route. When authenticated player ids are available, add
the verified user id to the limiter key and move the bucket to Vercel KV/Upstash or equivalent
durable edge storage for global enforcement.

## 4. Odds feed + cache (live prices in the book)

- With Supabase keys set and the migration applied, the browser's `connectOddsCache()` reads
  the live cache and **subscribes to Realtime** automatically — no interval polling, prices
  update on push. With no keys it stays on the mock slate. Nothing to flip.
- To fill the cache, the **poller** must run. It's mock-safe: it only calls the real SGO feed
  when `SGO_LIVE=1`. Three ways to run it (see `../odds-and-fairness/odds-polling.md`):
  - **Vercel Cron** — already declared in `vercel.json` (`/api/poll-odds`). Note Hobby plans
    cap crons at ~once/day; that's a backstop, not live cadence.
  - **External pinger** (e.g. cron-job.org) hitting `https://<app>/api/poll-odds` every minute
    with the `Authorization: Bearer <CRON_SECRET>` header — best for free-tier near-real-time.
  - **Local loop** — `npm run poll:loop` while developing.
- Known issue to fix before relying on those leagues: EPL/UFC league IDs in `lib/odds`
  `ACTIVE_LEAGUES` currently return HTTP 400 (NBA/MLB/NHL/NFL verified). Owned by the
  sportsbook lane.

## 5. Auth (real username + password)

The Supabase Auth adapter is implemented and `SUPABASE_AUTH_WIRED = true`, so **once keys are
present it becomes the live auth backend**; with no keys the local demo adapter runs (operator
/ agent / marco, password `demo`). To use it:

1. In **Supabase → Authentication → Providers → Email**, **disable "Confirm email"** (the app
   logs in by username via a synthetic email; with confirmation on, `signUp` returns no session
   and the adapter surfaces "confirm the email before signing in"). If you instead want real
   email confirmation, set `SUPABASE_AUTH_EMAIL_DOMAIN` to a domain you control.
2. Logins map `username` → `username@<domain>`. The username + display name are stored in
   `user_metadata`; the **book member id, tenant, and role** come from server-set
   `app_metadata` claims (`member_id`, `tenant_id`, `role`) — that's how the gate trusts the
   role rather than a client guess.
3. **TODO(api):** set those `app_metadata` claims when you link a Supabase user to a book
   member (today a fresh sign-up is "unlinked" and lands in the no-player state, exactly like
   the demo adapter). An operator-side "link account" action is the follow-up.

## 6. Scheduled promos cron

`/api/run-promos` is declared in `vercel.json` and is **mock-safe**: with no Supabase keys it's
a no-op (the in-app runner fires schedules while a tab is open). With keys it reads the
persisted schedule doc and fires every **due** bonus, advancing each (recurring re-arms,
one-offs deactivate). Guard it with `CRON_SECRET`. For finer-than-daily cadence on Hobby, use
an external pinger as in step 4.

## 7. The two remaining code seams (TODO(api))

These are small, isolated, and documented in code — they don't block provisioning, but the
**live money + promo paths stay inert until they're wired** (by design — nothing moves money
on a half-configured backend):

1. **Server-side bonus dispatch** for the promos cron. `runScheduledPromosCron` takes a
   `send(draft)` dispatcher; the route doesn't pass one yet because granting server-side needs
   the book/org hydrated on the server. Until it's wired, the live cron reports `ran:false` and
   advances nothing (**no bonus is lost**). Wire `send` to the server-authoritative grant once
   the server seed exists.
2. **Schedule store + book on Supabase.** The schedule store and most app state still use
   `createLocalStore`; adopt `createStore` (the one-line swap the persistence README describes)
   so the cron has server-side schedules to read, and add a server seed (or a first-run
   migration of the localStorage book into `accounts`/`org_members`). Tracked in
   `supabase/README.md` "TODO before production".

## 8. Verify

- [ ] `supabase db push` applied `0001`–`0005` with no errors on a fresh DB.
- [ ] App boots with keys set; the book shows live (not mock) odds and updates without a full
      refresh (Realtime).
- [ ] You can sign in with a real Supabase user (email confirmation off, or a confirmed user).
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/poll-odds` returns
      `{ ok: true, ... }`; without the header (when `CRON_SECRET` is set) it returns `401`.
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/run-promos` returns
      `{ ok: true, ... }`.
- [ ] With **no** keys, everything still runs on localStorage + mock (the off-by-default
      invariant).
