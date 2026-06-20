-- DimeBag-Bets — betting pools + user-created leagues (CLAUDE.md §3, §5). Backs the pools/ module.
--
-- A POOL is a competition with a format plugin (pick'em / confidence / survivor / bracket /
-- squares); a LEAGUE is a season-scoped pool scored over weekly rounds. These tables hold the
-- pool / entry / pick / invite / league METADATA + state.
--
-- MONEY SAFETY: pools are CREDITS (closed-loop play money — CLAUDE.md §1), not fiat. Entry fees
-- HOLD and prizes PAY through the SAME audited core path (accounts / wagers / ledger + the 0003
-- money RPCs) as every other credit move; the live entry-fee holds live in-memory and are not
-- persisted. Only this config+state is new (like 0007_import) — `creator_id` / `account_id` /
-- `player_id` are back-references to org members, never a money write.
--
-- Like the rest of the app, the no-keys deployment persists pool state in the kv_documents blob
-- (namespace 'dimebag', key 'pools.state'); these tables are the relational shape for a keyed
-- deployment. Additive + off-by-default: with no Supabase keys nothing here is touched and the
-- local app is byte-identical. Scoping: owner = auth.uid() + a nullable tenant_id (per 0004).

-- ── pools ────────────────────────────────────────────────────────────────────────
create table if not exists pools (
  id               text primary key,
  owner            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id        text,
  creator_id       text references org_members (id) on delete set null,
  name             text not null,
  kind             text not null check (kind in ('pickem','confidence','survivor','bracket','squares','prop')),
  scope            text not null default 'event' check (scope in ('event','season')),
  privacy          text not null default 'public' check (privacy in ('public','invite','friends')),
  entry_cents      bigint not null default 0 check (entry_cents >= 0),
  max_entries      integer check (max_entries is null or max_entries > 0),
  min_entries      integer not null default 0 check (min_entries >= 0),
  guaranteed_cents bigint not null default 0 check (guaranteed_cents >= 0),
  prize_structure  jsonb not null default '[]'::jsonb,
  rake_bps         integer not null default 0 check (rake_bps between 0 and 10000),
  config           jsonb not null default '{}'::jsonb,
  results          jsonb,
  lifecycle        text not null default 'open' check (lifecycle in ('open','locked','scoring','settled','void')),
  lock_at          timestamptz,
  settle_rule      jsonb not null default '{}'::jsonb,
  prize_pool_cents bigint check (prize_pool_cents is null or prize_pool_cents >= 0),
  rake_cents       bigint check (rake_cents is null or rake_cents >= 0),
  created_at       timestamptz not null default now(),
  settled_at       timestamptz,
  voided_at        timestamptz
);
create index if not exists pools_owner_idx  on pools (owner);
create index if not exists pools_tenant_idx on pools (tenant_id);

-- ── pool_entries ───────────────────────────────────────────────────────────────
create table if not exists pool_entries (
  id          text primary key,
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id   text,
  pool_id     text not null references pools (id) on delete cascade,
  account_id  text references org_members (id) on delete set null,
  player_name text not null default '',
  stake_cents bigint not null default 0 check (stake_cents >= 0),
  picks       jsonb not null default '{}'::jsonb,
  joined_at   timestamptz not null default now()
);
create index if not exists pool_entries_pool_idx  on pool_entries (pool_id);
create index if not exists pool_entries_owner_idx on pool_entries (owner);

-- ── pool_picks ─────────────────────────────────────────────────────────────────
-- The normalized per-pick rows (the client keeps the picks inline on the entry; this is the
-- relational shape). `slot` = game/round/matchup/period id; `choice` = the picked value.
create table if not exists pool_picks (
  id        text primary key,
  owner     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id  text not null references pool_entries (id) on delete cascade,
  pool_id   text not null references pools (id) on delete cascade,
  slot      text not null,
  choice    jsonb not null default 'null'::jsonb
);
create index if not exists pool_picks_entry_idx on pool_picks (entry_id);
create index if not exists pool_picks_owner_idx on pool_picks (owner);

-- ── pool_invites ───────────────────────────────────────────────────────────────
create table if not exists pool_invites (
  id          text primary key,
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id   text,
  pool_id     text not null references pools (id) on delete cascade,
  player_id   text references org_members (id) on delete set null,
  code        text not null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);
create index if not exists pool_invites_pool_idx  on pool_invites (pool_id);
create index if not exists pool_invites_owner_idx on pool_invites (owner);

-- ── league_seasons ─────────────────────────────────────────────────────────────
create table if not exists league_seasons (
  id             text primary key,
  owner          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id      text,
  pool_id        text not null references pools (id) on delete cascade,
  weeks          integer not null default 1 check (weeks >= 1),
  scoring_config jsonb not null default '{}'::jsonb,
  week_results   jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists league_seasons_pool_idx  on league_seasons (pool_id);
create index if not exists league_seasons_owner_idx on league_seasons (owner);

-- ── RLS: client-owned, full CRUD scoped to the owner (operator/player-authored, non-figure) ──
revoke all on pools           from anon, authenticated;
revoke all on pool_entries    from anon, authenticated;
revoke all on pool_picks      from anon, authenticated;
revoke all on pool_invites    from anon, authenticated;
revoke all on league_seasons  from anon, authenticated;

alter table pools          enable row level security;
alter table pool_entries   enable row level security;
alter table pool_picks     enable row level security;
alter table pool_invites   enable row level security;
alter table league_seasons enable row level security;

grant select, insert, update, delete on pools          to authenticated;
grant select, insert, update, delete on pool_entries   to authenticated;
grant select, insert, update, delete on pool_picks     to authenticated;
grant select, insert, update, delete on pool_invites   to authenticated;
grant select, insert, update, delete on league_seasons to authenticated;

-- drop-before-create so the policy block is rerunnable (create policy is not idempotent).
drop policy if exists pools_rw on pools;
create policy pools_rw on pools
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists pool_entries_rw on pool_entries;
create policy pool_entries_rw on pool_entries
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists pool_picks_rw on pool_picks;
create policy pool_picks_rw on pool_picks
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists pool_invites_rw on pool_invites;
create policy pool_invites_rw on pool_invites
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists league_seasons_rw on league_seasons;
create policy league_seasons_rw on league_seasons
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
