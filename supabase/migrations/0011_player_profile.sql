-- DimeBag-Bets — player profile projection + follow graph (Round 3, Community & Contests).
--
-- Backs profile/: the read-only community foundation. player_profile_stats_mv is a PROJECTION of
-- the audited ledger (settled resolutions) — recomputed on each settlement, drop-and-rebuildable
-- to identical values, and reconciling to the ledger net exactly. follow_edge + profile_privacy
-- are the social graph + per-block visibility behind discovery and pool privacy.
--
-- THE CARDINAL RULE: nothing here is a money table. The mv holds DERIVED stats (no balance, no
-- credit movement); a follow is a social edge; privacy gates reads. The no-keys app holds all of
-- this in the kv_documents blob (namespace 'dimebag': the mv is recomputed in-memory from the
-- durable ledger; 'social.followEdges' / 'social.profilePrivacy'). These tables are the
-- relational shape for a keyed deployment — additive + OFF-BY-DEFAULT (byte-identical with no
-- Supabase keys).
--
-- SCOPING: owner = auth.uid() with a tenant_id column (per-book isolation, 0004). A player only
-- reads/writes their own follow edges + privacy. The stats projection is a MATERIALIZED VIEW the
-- server recomputes from the ledger — clients READ it, never write it.

-- ── player_profile_stats_mv — the projection (server-recomputed; clients read-only) ──
create table if not exists player_profile_stats_mv (
  player_id        text not null references org_members (id) on delete cascade,
  tenant_id        text,
  window           text not null check (window in ('7d','30d','season','all')),
  wagers           integer not null default 0,
  wins             integer not null default 0,
  losses           integer not null default 0,
  roi_bps          integer not null default 0,
  net_cents        bigint  not null default 0,
  units            numeric not null default 0,
  clv_beat_bps     integer,                       -- null until closing lines are captured
  longest_streak   integer not null default 0,
  current_streak   integer not null default 0,    -- signed: + win run, − loss run
  by_sport         jsonb   not null default '{}'::jsonb,
  by_market        jsonb   not null default '{}'::jsonb,
  updated_at       timestamptz not null default now(),
  primary key (player_id, window)
);
create index if not exists ppsm_tenant_idx on player_profile_stats_mv (tenant_id);

-- READ-ONLY to clients: the server (a settlement-triggered job / SECURITY DEFINER fn) is the only
-- writer, so the projection can never be inflated from the client. RLS: a player reads their own
-- row; leaderboards/discovery read 'public' rows (joined against profile_privacy server-side).
revoke all on player_profile_stats_mv from anon, authenticated;
alter table player_profile_stats_mv enable row level security;
grant select on player_profile_stats_mv to authenticated;
create policy ppsm_read_own on player_profile_stats_mv
  for select to authenticated using (player_id = auth.uid()::text);

-- ── follow_edge — the social graph (scoped) ──
create table if not exists follow_edge (
  follower_id text not null,
  followee_id text not null,
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id   text,
  scope       text not null default 'all' check (scope in ('all','sport')),
  sport_id    text,                                -- set only for scope 'sport'
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id, scope, sport_id),
  check (follower_id <> followee_id)
);
create index if not exists follow_edge_followee_idx on follow_edge (followee_id);
create index if not exists follow_edge_owner_idx on follow_edge (owner);

revoke all on follow_edge from anon, authenticated;
alter table follow_edge enable row level security;
grant select, insert, delete on follow_edge to authenticated;
-- A viewer manages their own edges; anyone may READ the graph (it drives public discovery).
create policy follow_edge_read on follow_edge for select to authenticated using (true);
create policy follow_edge_write on follow_edge
  for insert to authenticated with check (owner = auth.uid());
create policy follow_edge_delete on follow_edge
  for delete to authenticated using (owner = auth.uid());

-- ── profile_privacy — per-block visibility ──
create table if not exists profile_privacy (
  player_id  text not null,
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id  text,
  block_key  text not null,
  visibility text not null default 'public' check (visibility in ('public','followers','private')),
  primary key (player_id, block_key)
);
create index if not exists profile_privacy_owner_idx on profile_privacy (owner);

revoke all on profile_privacy from anon, authenticated;
alter table profile_privacy enable row level security;
grant select, insert, update, delete on profile_privacy to authenticated;
-- Visibility rows are readable (the read path must resolve them); only the owner writes them.
create policy profile_privacy_read on profile_privacy for select to authenticated using (true);
create policy profile_privacy_write on profile_privacy
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
