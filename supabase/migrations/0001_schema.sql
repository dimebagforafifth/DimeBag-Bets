-- DimeBag-Bets — server data schema (CLAUDE.md §3, §6).
--
-- Mirrors the shared `core` money model and the org/vip read-models, normalised into
-- tables. ALL money is integer cents -> bigint (never float; the figure must be exact).
-- The figure is moved ONLY by the SECURITY DEFINER functions in 0003_money_rpcs.sql;
-- clients get SELECT on their own rows and EXECUTE on those functions, nothing more
-- (see 0002_rls.sql). This file is the canonical server copy of core's data shapes.

-- Wager ids when the client doesn't supply one (core uses `w_<n>`; keep the shape).
create sequence if not exists wager_seq;

-- ── accounts ──────────────────────────────────────────────────────────────────
-- One row per player account = core.Account. `owner` is the auth user who may READ
-- it; writes never come from the client (no UPDATE grant), only from the RPCs.
create table if not exists accounts (
  id            text primary key,
  owner         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  credit_limit  bigint not null default 0 check (credit_limit >= 0),
  balance       bigint not null default 0,
  pending       bigint not null default 0 check (pending >= 0),
  max_wager     bigint check (max_wager is null or max_wager > 0),
  min_wager     bigint check (min_wager is null or min_wager > 0),
  max_payout    bigint check (max_payout is null or max_payout >= 0),
  betting_locked boolean not null default false,
  updated_at    timestamptz not null default now()
);
create index if not exists accounts_owner_idx on accounts (owner);

-- ── wagers ────────────────────────────────────────────────────────────────────
-- core.Wager. Generic: a stake at risk, later graded with an outcome + multiplier.
create table if not exists wagers (
  id                 text primary key,
  account_id         text not null references accounts (id) on delete cascade,
  stake              bigint not null check (stake > 0),
  status             text not null default 'open' check (status in ('open', 'resolved')),
  outcome            text check (outcome in ('win', 'loss', 'push', 'void')),
  payout_multiplier  double precision,
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);
create index if not exists wagers_account_idx on wagers (account_id, status);

-- ── ledger ────────────────────────────────────────────────────────────────────
-- Append-only money history (mirrors ledger/ledger.ts), written by the RPCs so the
-- running story is server-side and tamper-evident.
create table if not exists ledger (
  id            bigserial primary key,
  account_id    text not null references accounts (id) on delete cascade,
  wager_id      text references wagers (id) on delete set null,
  kind          text not null check (kind in ('place', 'resolve', 'settle', 'adjust', 'grant')),
  balance_delta bigint not null default 0,
  pending_delta bigint not null default 0,
  balance_after bigint not null,
  pending_after bigint not null,
  outcome       text,
  multiplier    double precision,
  actor         text,
  reason        text,
  meta          jsonb,
  at            timestamptz not null default now()
);
create index if not exists ledger_account_idx on ledger (account_id, at);

-- ── settlements ───────────────────────────────────────────────────────────────
-- Weekly square-up records: the figure BEFORE it was reset to zero (CLAUDE.md §3).
create table if not exists settlements (
  id             bigserial primary key,
  account_id     text not null references accounts (id) on delete cascade,
  balance_before bigint not null,
  period         text,
  settled_at     timestamptz not null default now()
);
create index if not exists settlements_account_idx on settlements (account_id, settled_at);

-- ── org_members ───────────────────────────────────────────────────────────────
-- The Pay-Per-Head tree (org/types.ts Member). The figure lives in `accounts`; this
-- just arranges accounts into manager > subagent > agent > player and enforces shape.
create table if not exists org_members (
  id         text primary key,
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role       text not null check (role in ('manager', 'subagent', 'agent', 'player')),
  name       text not null,
  parent_id  text references org_members (id) on delete set null,
  account_id text references accounts (id) on delete set null,
  active     boolean not null default true,
  profile    jsonb not null default '{}'::jsonb
);
create index if not exists org_members_owner_idx on org_members (owner);
create index if not exists org_members_parent_idx on org_members (parent_id);

-- ── vip ───────────────────────────────────────────────────────────────────────
-- The manager-owned VIP program config (vip/types.ts) + per-player VIP state.
create table if not exists vip_config (
  owner      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  released   boolean not null default false,
  auto_grant boolean not null default false,
  ranks      jsonb not null default '[]'::jsonb
);
create table if not exists vip_players (
  account_id    text primary key references accounts (id) on delete cascade,
  wagered       bigint not null default 0 check (wagered >= 0),
  claimed_ranks jsonb not null default '[]'::jsonb,
  free_play     bigint not null default 0 check (free_play >= 0)
);

-- ── kv_documents ──────────────────────────────────────────────────────────────
-- Opaque versioned JSON documents behind the persistence KVStore seam (settings,
-- tickets, the org snapshot, manager docs). NOT money — these are client-writable
-- blobs, scoped to their owner. The money path is the typed tables above.
create table if not exists kv_documents (
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  namespace  text not null,
  key        text not null,
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner, namespace, key)
);
