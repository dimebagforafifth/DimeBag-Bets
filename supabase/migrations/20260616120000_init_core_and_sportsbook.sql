-- DimeBag-Bets — initial schema: shared money core + provider-agnostic sportsbook
-- =============================================================================
-- Mirrors the contracts in CLAUDE.md §3 (money model) and §4 (house rules), and
-- the TypeScript `core/` module (Account, Wager, Outcome, settleWeek).
--
-- Design rules honored here:
--  * ONE shared balance. Every module (casino games + sportsbook) settles through
--    the generic `wagers` table — no module tracks its own points (§3, §5).
--  * `wagers` is GENERIC: a stake, an outcome, a payout multiplier. Game- and
--    sportsbook-specific detail hangs off it via separate tables (§3).
--  * Provider-agnostic sportsbook: every externally-sourced row carries
--    (source, external_id) with a unique constraint, so swapping odds providers
--    is just a different ingester writing the same tables. No provider is baked in.
--  * Points are INTEGERS in the smallest unit -> BIGINT. Odds/multipliers are
--    decimals -> NUMERIC. Points have no monetary value (§1).
--
-- Writes to balances, settlement, and the odds catalog are expected to run
-- server-side (Supabase service role / edge functions), which bypasses RLS.
-- RLS below gives end users read access to their own rows + the public catalog.
-- =============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- Keep updated_at fresh on any row update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- SHARED MONEY CORE (CLAUDE.md §3)
-- =============================================================================

-- One account per player — the per-account state the whole app shares.
create table public.accounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid unique references auth.users (id) on delete cascade,
  -- How far the player may go down: the most they can owe before settling.
  credit_limit bigint not null default 0 check (credit_limit >= 0),
  -- The "figure": running standing. Positive = book owes player; negative =
  -- player owes book (never past -credit_limit). Maintained by the ledger.
  balance      bigint not null default 0,
  -- Total of wagers currently at risk (placed, not yet graded).
  pending      bigint not null default 0 check (pending >= 0),
  -- availableToWager(account) = creditLimit + balance - pending  (core/core.ts).
  available_to_wager bigint generated always as (credit_limit + balance - pending) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- A single wager — the generic unit every module settles through.
-- Lifecycle: place (status=open, stake held in accounts.pending) -> grade
-- (outcome) -> adjust (release hold, move balance). See core/core.ts.
create table public.wagers (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts (id) on delete cascade,
  -- Which module placed it: 'mines','crash','dice','limbo','keno','plinko','sportsbook'.
  module            text not null,
  stake             bigint not null check (stake > 0),
  status            text not null default 'open' check (status in ('open', 'resolved')),
  -- Set once resolved (CLAUDE.md §3 / core Outcome).
  outcome           text check (outcome in ('win', 'loss', 'push', 'void')),
  -- The multiplier used to grade the result (stake x payout_multiplier returned).
  payout_multiplier numeric(14, 4),
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  -- An open wager has no outcome; a resolved one always does.
  constraint wager_resolution_consistent check (
    (status = 'open'     and outcome is null and resolved_at is null) or
    (status = 'resolved' and outcome is not null)
  ),
  -- A win needs a payout multiplier > 1 (core/core.ts throws otherwise).
  constraint wager_win_needs_multiplier check (
    outcome is distinct from 'win' or (payout_multiplier is not null and payout_multiplier > 1)
  )
);

create index wagers_account_idx on public.wagers (account_id);
create index wagers_open_idx on public.wagers (account_id) where status = 'open';

-- Append-only ledger: every change to a balance, for audit + history (Phase 1).
-- Source of truth behind accounts.balance; one row per money movement.
create table public.transactions (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts (id) on delete cascade,
  wager_id      uuid references public.wagers (id) on delete set null,
  -- 'wager_place' (hold), 'wager_settle' (win/loss/push/void), 'weekly_settlement', 'adjustment'.
  type          text not null check (type in ('wager_place', 'wager_settle', 'weekly_settlement', 'adjustment')),
  -- Signed delta applied to balance (0 for pure holds/pushes/voids).
  amount        bigint not null,
  -- Balance after this entry, for a verifiable running figure.
  balance_after bigint not null,
  note          text,
  created_at    timestamptz not null default now()
);

create index transactions_account_idx on public.transactions (account_id, created_at);
create index transactions_wager_idx on public.transactions (wager_id);

-- Weekly square-up + reset to zero (CLAUDE.md §3 settleWeek; pending issue M1:
-- record the settlement instead of silently zeroing).
create table public.weekly_settlements (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts (id) on delete cascade,
  week_start      date not null,
  week_end        date not null,
  -- The figure at close, before reset.
  closing_balance bigint not null,
  direction       text not null check (direction in ('paid_in', 'paid_out', 'flat')),
  amount          bigint not null default 0,
  settled_at      timestamptz not null default now(),
  unique (account_id, week_start)
);

-- =============================================================================
-- PROVABLY-FAIR CASINO ROUNDS (CLAUDE.md §6, §7)
-- =============================================================================
-- The per-round disclosure for casino games. Generic: game-specific outcome
-- detail lives in `result` (jsonb) so the crypto/commitment shape is shared and
-- never copied per game. server_seed is withheld until the round ends.
create table public.game_rounds (
  id               uuid primary key default gen_random_uuid(),
  wager_id         uuid not null references public.wagers (id) on delete cascade,
  account_id       uuid not null references public.accounts (id) on delete cascade,
  game             text not null,
  server_seed_hash text not null,                 -- committed before the round
  server_seed      text,                          -- revealed after settlement
  client_seed      text not null,
  nonce            integer not null,
  result           jsonb,                          -- game-specific outcome
  created_at       timestamptz not null default now(),
  settled_at       timestamptz
);

create index game_rounds_account_idx on public.game_rounds (account_id);

-- =============================================================================
-- SPORTSBOOK — provider-agnostic catalog (CLAUDE.md §4)
-- =============================================================================
-- `source` + `external_id` everywhere: the ingester maps any provider into these
-- tables; the rest of the app never knows which API supplied the data.

create table public.sports (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,                -- e.g. 'americanfootball_nfl'
  title      text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  sport_id      uuid not null references public.sports (id) on delete cascade,
  source        text not null,                     -- which provider supplied this
  external_id   text not null,                     -- provider's event id
  home_team     text,
  away_team     text,
  commence_time timestamptz,
  status        text not null default 'scheduled'
                check (status in ('scheduled', 'live', 'final', 'postponed', 'canceled')),
  -- Whether the game went far enough to be official (§4 thresholds).
  is_official   boolean not null default false,
  result        jsonb,                             -- final scores / box-score for grading
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (source, external_id)
);

create index events_sport_idx on public.events (sport_id);
create index events_commence_idx on public.events (commence_time);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- A market within an event (moneyline, spread, total, player prop, ...).
create table public.markets (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  -- 'h2h' (moneyline), 'spreads', 'totals', 'player_prop', 'outright', ...
  type        text not null,
  name        text,
  line        numeric(10, 2),                      -- handicap / total line (null for h2h)
  player      text,                                -- for player props
  period      text,                                -- full game / half / quarter, etc.
  status      text not null default 'open'
              check (status in ('open', 'suspended', 'settled')),
  source      text not null,
  external_id text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index markets_event_idx on public.markets (event_id);

create trigger markets_set_updated_at
  before update on public.markets
  for each row execute function public.set_updated_at();

-- A selectable outcome with its current price (decimal odds). Odds move over time;
-- a placed bet leg locks the price it was taken at (§4 bet acceptance).
create table public.selections (
  id          uuid primary key default gen_random_uuid(),
  market_id   uuid not null references public.markets (id) on delete cascade,
  name        text not null,                       -- team / 'Over' / 'Under' / player
  price       numeric(14, 4) not null,             -- current decimal odds
  point       numeric(10, 2),                      -- line attached to this outcome
  status      text not null default 'open'
              check (status in ('open', 'won', 'lost', 'push', 'void')),
  source      text not null,
  external_id text,
  updated_at  timestamptz not null default now(),
  unique (source, external_id)
);

create index selections_market_idx on public.selections (market_id);

create trigger selections_set_updated_at
  before update on public.selections
  for each row execute function public.set_updated_at();

-- Optional line-movement history (for honesty/§4 + future grading audits).
create table public.odds_history (
  id           uuid primary key default gen_random_uuid(),
  selection_id uuid not null references public.selections (id) on delete cascade,
  price        numeric(14, 4) not null,
  point        numeric(10, 2),
  recorded_at  timestamptz not null default now()
);

create index odds_history_selection_idx on public.odds_history (selection_id, recorded_at);

-- =============================================================================
-- SPORTSBOOK — bets (singles + parlays), settled through the shared core
-- =============================================================================
-- A sportsbook bet's MONEY lives in `wagers` (module='sportsbook'); this adds the
-- sportsbook-specific shape. A parlay re-prices when a leg pushes/voids (§4): the
-- final settled multiplier goes onto wagers.payout_multiplier at resolution.
create table public.bet_slips (
  id           uuid primary key default gen_random_uuid(),
  wager_id     uuid not null unique references public.wagers (id) on delete cascade,
  account_id   uuid not null references public.accounts (id) on delete cascade,
  type         text not null check (type in ('single', 'parlay')),
  -- Combined decimal odds locked at placement (product of leg prices).
  placed_price numeric(14, 4) not null,
  created_at   timestamptz not null default now()
);

create index bet_slips_account_idx on public.bet_slips (account_id);

-- One leg per selection. Every leg must win for a parlay to win; a push/void leg
-- drops out and the slip re-prices on the rest (§4).
create table public.bet_legs (
  id           uuid primary key default gen_random_uuid(),
  bet_slip_id  uuid not null references public.bet_slips (id) on delete cascade,
  selection_id uuid not null references public.selections (id),
  -- Snapshot of the line + odds at the moment the leg was added (bet locks at the
  -- price shown — line moves don't change an accepted bet, §4).
  locked_price numeric(14, 4) not null,
  locked_point numeric(10, 2),
  outcome      text not null default 'pending'
               check (outcome in ('pending', 'won', 'lost', 'push', 'void')),
  settled_at   timestamptz
);

create index bet_legs_slip_idx on public.bet_legs (bet_slip_id);
create index bet_legs_selection_idx on public.bet_legs (selection_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- User-owned tables: a player reads only their own rows. All writes (place,
-- settle, ingest) run server-side as the service role, which bypasses RLS.
alter table public.accounts            enable row level security;
alter table public.wagers              enable row level security;
alter table public.transactions        enable row level security;
alter table public.weekly_settlements  enable row level security;
alter table public.game_rounds         enable row level security;
alter table public.bet_slips           enable row level security;
alter table public.bet_legs            enable row level security;

create policy "own account" on public.accounts
  for select using (user_id = auth.uid());

create policy "own wagers" on public.wagers
  for select using (
    account_id in (select id from public.accounts where user_id = auth.uid())
  );

create policy "own transactions" on public.transactions
  for select using (
    account_id in (select id from public.accounts where user_id = auth.uid())
  );

create policy "own settlements" on public.weekly_settlements
  for select using (
    account_id in (select id from public.accounts where user_id = auth.uid())
  );

create policy "own game rounds" on public.game_rounds
  for select using (
    account_id in (select id from public.accounts where user_id = auth.uid())
  );

create policy "own bet slips" on public.bet_slips
  for select using (
    account_id in (select id from public.accounts where user_id = auth.uid())
  );

create policy "own bet legs" on public.bet_legs
  for select using (
    bet_slip_id in (
      select bs.id from public.bet_slips bs
      join public.accounts a on a.id = bs.account_id
      where a.user_id = auth.uid()
    )
  );

-- Public catalog: readable by any authenticated user; writes are service-role only.
alter table public.sports       enable row level security;
alter table public.events       enable row level security;
alter table public.markets      enable row level security;
alter table public.selections   enable row level security;
alter table public.odds_history enable row level security;

create policy "read sports"      on public.sports       for select to authenticated using (true);
create policy "read events"      on public.events       for select to authenticated using (true);
create policy "read markets"     on public.markets      for select to authenticated using (true);
create policy "read selections"  on public.selections   for select to authenticated using (true);
create policy "read odds history" on public.odds_history for select to authenticated using (true);
