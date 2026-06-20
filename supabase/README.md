# `supabase/` — the server data layer

The database schema, security, and server-authoritative money functions for
DimeBag-Bets (CLAUDE.md §3, §6). **Off until keys are dropped in** — the app runs on
localStorage + in-process `core` with no Supabase project at all. Add the project +
keys and the same code switches over (see `persistence/README.md`).

## What's here

`migrations/` (run in order — Supabase CLI applies them lexically):

| File | What |
|------|------|
| `0001_schema.sql` | Tables mirroring `core`/`org`/`vip`: `accounts`, `wagers`, `ledger`, `settlements`, `org_members`, `vip_config`, `vip_players`, plus the opaque `kv_documents` blob store. All money is integer cents → `bigint`. |
| `0002_rls.sql` | Row Level Security. Players **read only their own rows**; **no client write grant** on the money tables; `kv_documents` is owner-scoped CRUD. |
| `0003_money_rpcs.sql` | The SECURITY DEFINER functions — `place_wager`, `resolve_wager`, `resolve_at_multiplier`, `grant_bonus`, `adjust_balance`, `settle_week` — the only path that moves a figure. Same arithmetic as `core/core.ts`. |
| `0004_tenancy.sql` | Per-book (tenant) scoping: an additive `tenant_id` on the book-owned tables + an `active_tenant()` claim helper. Documents how isolation holds (owner-scoping already isolates one-operator-per-book; `tenant_id` is the explicit book key + the multi-user-book future). Backward-compatible (nullable). |
| `0005_odds_cache.sql` | The SGO odds cache: `odds_events` / `odds_markets` / `odds_selections` (snake-case mirrors of `lib/odds/contract.ts`). **Odds are public** — RLS grants SELECT to everyone and withholds all client writes; only the server-side poller (service role) writes. The three tables are added to the `supabase_realtime` publication so `useBookOdds()` can move from interval polling to live pushes. |
| `0006_fairness_seeds.sql` | Provably-fair durable seed store (`fairness_seeds`): one row per issued server seed (commit hash before play, reveal after). **Service-role only** — RLS enabled with no client grant or policy. |
| `0007_import.sql` | Operator player-import records: `import_batches` / `import_rows` / `import_mapping_templates`. Operator-authored, non-money config — client-owned CRUD scoped to `owner = auth.uid()` with a `tenant_id`. `player_id` is a back-reference to the created member, never a money write. |
| `0008_pricing_config.sql` | SGO pricing config: `pricing_config` — the operator's de-vig method + house margin (bps) as data, scoped global/sport/market. **Non-money** operator config (never moves a balance). Owner-scoped CRUD with a `tenant_id`; off-by-default (zero rows reproduces today's pricing exactly). |
| `0009_billing.sql` | **FIAT** per-head software billing: `billing_config` / `billing_periods` / `billing_head_snapshots`. The operator's real-money cost (per active player/week) — integer-cents dollars, **NOT** the player figure, **NOT** the ledger, never the `0003` money RPCs. Operator-owned CRUD scoped to `owner = auth.uid()` with a `tenant_id`; off-by-default. (Renumbered from 0008 at the r2 wiring pass to avoid colliding with `0008_pricing_config.sql`.) |
| `0010_player_profile.sql` | Player-profile READ-ONLY projection + social graph: `player_profile_stats_mv` (the materialised windowed stats), `follow_edge` (the sport-scoped follow edges; 'all' edges live in social), `profile_privacy` (per-block visibility). **Non-money** — pure projection of the audited ledger, mints nothing. `player_profile_stats_mv` is client-read-only (read-own RLS); `follow_edge`/`profile_privacy` are owner-scoped CRUD. Off-by-default. |
| `0011_pools.sql` | Betting pools + user-created leagues: `pools` / `pool_entries` / `pool_picks` / `pool_invites` / `league_seasons`. **CREDIT** pools (entries/prizes flow through the same audited core path as every bet — these are config+state only, like `0007_import`, **not** fiat). Client-owned CRUD scoped to `owner = auth.uid()` with a `tenant_id`; member back-refs `on delete set null`; off-by-default. (Renumbered from 0010 at the r3 wiring pass to avoid colliding with `0010_player_profile.sql`.) |
| `0012_player_limits.sql` | Responsible-play self-limits: `player_limits` (a player's own wager/loss caps, cool-off, soft session). **Non-money** — config only; the limit GATE lives in `core.placeWager` (`assertWithinLimits`, no-op when unset → default placement byte-identical), never a balance write. Owner-scoped CRUD with a `tenant_id`; off-by-default. (Renumbered from 0010 at the r3 wiring pass to avoid colliding with `0010_player_profile.sql`.) |

## Migration reconciliation (2026-06-16)

The repo briefly carried **two** schemas for the same tables:

- the **sequential `0001`–`0005`** set above (canonical), and
- a single consolidated `20260616120000_init_core_and_sportsbook.sql` (an earlier
  exploratory schema from the first Supabase handoff).

They were **incompatible**, not complementary — both did `create table accounts` /
`wagers` / `markets` / `selections` with **different column types** (e.g. `accounts.id`
as `uuid` + a `user_id` FK in the consolidated file vs `text` + an `owner` column in
`0001`, a `transactions` ledger vs `ledger`, `weekly_settlements` vs `settlements`).
Applied together to a fresh DB they fail on the duplicate `create table`.

The sequential set is the one the **TypeScript code actually targets** — the
`kv_documents` blob store (`persistence/supabase/kv-transport.ts`), the six SECURITY
DEFINER money RPCs the test double mirrors (`persistence/money/rpc.ts` ↔
`fake-server.ts`), the `odds_*` cache the poller writes and the book reads
(`app/book/odds-source.ts`), and the `tenant_id` columns (`persistence/tenant.ts`). The
consolidated file had **no consumer** in the codebase (verified by grep: nothing
references `transactions`, `weekly_settlements`, `bet_slips`, `bet_legs`, `odds_history`
or `game_rounds`).

**Resolution:** the consolidated `20260616…` migration was **retired** (removed); the
canonical, ordered `0001`–`0005` set is the single source of truth and applies cleanly
to a fresh DB in lexical order. The RLS policies (`0002`) and money RPCs (`0003`) are
preserved exactly. Ideas worth salvaging later from the retired file (a provably-fair
`game_rounds` disclosure table for Agent B's commit-reveal work; an `odds_history`
line-movement audit) are recoverable from git history and noted here so they aren't lost.

## The guarantee

A figure moves **only** through the RPCs. Clients are granted `SELECT` (their own
rows) and `EXECUTE` on the six functions — and nothing else. There is deliberately no
`INSERT/UPDATE/DELETE` grant or policy on `accounts`, so a forged
`PATCH /rest/v1/accounts?id=eq.me` with a fat `balance` is refused by Postgres. The
RPCs validate (credit limit, max/min bet, betting lock, double-resolve, settle-with-
pending) before writing, exactly as core does. This is asserted offline by
`persistence/money/supabase-money.test.ts` against the in-TS double in
`persistence/supabase/fake-server.ts`, which mirrors these functions.

## Applying

```bash
supabase start                 # local stack, or use a hosted project
supabase db push               # apply migrations/ in order (0001 → 0005)
# or: psql "$DATABASE_URL" -f migrations/0001_schema.sql  (then 0002 … 0005)
```

## Tenant isolation

A tenant = one manager's book. **Locally** the client encodes the tenant in the storage
namespace (`dimebag~t~<tenant>`, see `persistence/tenant.ts`), so two operators' books
never share a keyspace. **Under Supabase** the same separation holds two ways: the
per-book `namespace` on `kv_documents`, and owner-scoped RLS on the money tables (one
operator authenticates as one `auth.uid()` and sees only their rows). `0004_tenancy.sql`
adds the explicit `tenant_id` and sketches the membership-based policy for a future where
many auth users share one book.

Then set the two env vars the app reads (either name works):

```
SUPABASE_URL=https://<project>.supabase.co       # or VITE_SUPABASE_URL for the browser build
SUPABASE_ANON_KEY=<anon key>                      # or VITE_SUPABASE_ANON_KEY
```

## TODO before production

- **TODO(integration):** run these migrations against a real/local Postgres and assert
  the same guarantees with pgTAP (the TS double proves the *client* contract; only the
  SQL proves the *server*). See the note atop `fake-server.ts`.
- **TODO(api):** wire real auth so `auth.uid()` is the signed-in operator; until then
  the app uses the anon key and the local fallback. `grant`/`adjust`/`settle` are
  operator actions — restrict them to a manager role/claim when auth lands.
- Seeding: the current app seeds a demo org client-side. A server seed (or a first-run
  migration of the localStorage book into `accounts`/`org_members`) is a follow-up.
