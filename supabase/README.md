# Supabase

Database schema for DimeBag-Bets. Not yet applied to any remote project — this is
the schema definition only (the odds-API provider is still undecided, so the
sportsbook tables are deliberately provider-agnostic).

## Layout

- `migrations/20260616120000_init_core_and_sportsbook.sql` — initial schema:
  - **Shared money core** (CLAUDE.md §3): `accounts`, `wagers`, `transactions`
    (ledger), `weekly_settlements`. Mirrors the TypeScript `core/` contract —
    `accounts.available_to_wager` is a generated column equal to
    `credit_limit + balance - pending`. Every module settles through the generic
    `wagers` table; no module tracks its own points.
  - **Provably-fair casino rounds**: `game_rounds` (seed-hash commit, revealed
    seed, client seed, nonce, jsonb result).
  - **Provider-agnostic sportsbook** (CLAUDE.md §4): `sports`, `events`,
    `markets`, `selections`, `odds_history`, plus `bet_slips` / `bet_legs` for
    singles + parlays. Every externally-sourced row carries `(source,
    external_id)` so any odds provider maps into the same tables.

## Design notes

- **Points are integers** (`BIGINT`, smallest unit, no monetary value). Odds and
  payout multipliers are `NUMERIC`.
- **RLS** is on. End users can read only their own account/wagers/bets and the
  public odds catalog. All balance/settlement/ingest writes are expected to run
  server-side (service role / edge functions), which bypasses RLS.
- The TypeScript `core/` place → grade → adjust flow maps directly:
  `placeWager` → insert `wagers` row + `transactions(type='wager_place')` and bump
  `accounts.pending`; `resolveWager` → set outcome + `transactions(type='wager_settle')`
  and move `balance`; `settleWeek` → write `weekly_settlements` then reset balance
  (closes pending issue M1).

## Applying it (when ready)

Local dev:

```bash
npm i -g supabase        # or: brew install supabase/tap/supabase
supabase init            # if not already initialized
supabase start           # local Postgres + studio
supabase db reset        # applies everything in migrations/
```

Remote project: link with `supabase link --project-ref <ref>` then
`supabase db push`. (Review before pushing — this creates all tables + RLS.)
