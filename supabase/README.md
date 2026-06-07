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
supabase db push               # apply migrations/
# or: psql "$DATABASE_URL" -f migrations/0001_schema.sql  (then 0002, 0003)
```

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
