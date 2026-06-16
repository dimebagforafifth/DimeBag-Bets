-- DimeBag-Bets — SGO odds cache (data/feed lane).
--
-- Three tables hold the normalized odds slate the poller (lib/odds/poller.ts) fills from
-- the active provider. Unlike the money tables, ODDS ARE PUBLIC: every player sees the same
-- prices, so RLS allows SELECT to everyone but withholds all writes from clients — only the
-- server-side poller (service_role, which bypasses RLS) writes. Tables are added to the
-- realtime publication so the UI lane's useBookOdds() hook gets live pushes.
--
-- Shapes mirror lib/odds/contract.ts (NormalizedEvent/Market/Selection) in snake_case.
-- American prices are integers; decimal prices + lines are numeric (never money — these are
-- odds, not the credit/balance figure).

-- ── odds_events ───────────────────────────────────────────────────────────────
create table if not exists odds_events (
  event_id    text primary key,
  league_id   text not null,
  sport       text not null,
  home        text not null,
  away        text not null,
  starts_at   timestamptz not null,
  status      text not null check (status in ('pre', 'live', 'ended')),
  updated_at  timestamptz not null default now()
);
create index if not exists odds_events_league_idx on odds_events (league_id, status, starts_at);
create index if not exists odds_events_status_idx on odds_events (status);

-- ── odds_markets ──────────────────────────────────────────────────────────────
create table if not exists odds_markets (
  market_id   text primary key,
  event_id    text not null references odds_events (event_id) on delete cascade,
  type        text not null check (type in ('moneyline', 'spread', 'total', 'prop')),
  period      text not null,
  stat_id     text,
  player_id   text,
  updated_at  timestamptz not null default now()
);
create index if not exists odds_markets_event_idx on odds_markets (event_id);

-- ── odds_selections ─────────────────────────────────────────────────────────-─
-- priceRaw = raw feed price; priceDisplay = after house margin/override. `override` marks
-- a hand-set display price the poller must NOT clobber on the next cycle (see pricing.ts).
create table if not exists odds_selections (
  selection_id            text primary key,
  market_id               text not null references odds_markets (market_id) on delete cascade,
  event_id                text not null references odds_events (event_id) on delete cascade,
  side                    text not null,
  line                    numeric,
  price_raw_american      integer not null,
  price_raw_decimal       numeric not null,
  price_display_american  integer not null,
  price_display_decimal   numeric not null,
  bookmaker               text not null,
  available               boolean not null default true,
  override                boolean not null default false,
  updated_at              timestamptz not null default now()
);
create index if not exists odds_selections_market_idx on odds_selections (market_id);
create index if not exists odds_selections_event_idx on odds_selections (event_id);
create index if not exists odds_selections_override_idx on odds_selections (event_id) where override;

-- ── RLS: public read, no client writes ──────────────────────────────────────-─
alter table odds_events enable row level security;
alter table odds_markets enable row level security;
alter table odds_selections enable row level security;

-- Everyone (anon + authenticated) may READ the slate; nobody may write from the client.
-- The poller writes with the service_role key, which bypasses RLS entirely.
drop policy if exists odds_events_read on odds_events;
create policy odds_events_read on odds_events for select using (true);
drop policy if exists odds_markets_read on odds_markets;
create policy odds_markets_read on odds_markets for select using (true);
drop policy if exists odds_selections_read on odds_selections;
create policy odds_selections_read on odds_selections for select using (true);

-- Belt-and-braces: withhold write grants from the client roles (read-only on the cache).
revoke insert, update, delete on odds_events, odds_markets, odds_selections from anon, authenticated;
grant select on odds_events, odds_markets, odds_selections to anon, authenticated;

-- ── realtime: push cache changes to subscribed clients (useBookOdds) ──────────-
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table odds_events';
    execute 'alter publication supabase_realtime add table odds_markets';
    execute 'alter publication supabase_realtime add table odds_selections';
  end if;
exception
  when duplicate_object then null; -- already in the publication
end $$;
