-- DimeBag-Bets — odds pricing_config (SGO pricing pipeline, math half).
--
-- Backs lib/odds/pricing-config.ts: the operator's de-vig method + house margin, as data, at
-- three scopes (global / per-sport / per-market). The pricing pipeline resolves the most-
-- specific row, de-vigs the raw market to true probabilities, then re-applies the configured
-- margin (basis points + favorite shade) before Lane B's gate publishes.
--
-- Like the rest of the app state, the no-keys app persists this in the kv_documents blob
-- (namespace 'dimebag', key 'odds.pricingConfig'); this dedicated table is the relational shape
-- for a keyed deployment. It is additive + OFF-BY-DEFAULT: with no Supabase keys nothing here is
-- touched and the local app is byte-identical.
--
-- NO MONEY: pricing_config is operator-authored, non-money config (it sets how odds are priced,
-- never moves a balance). So — like kv_documents / import — it's client-writable CRUD scoped to
-- owner = auth.uid(), with a tenant_id column for the per-book isolation 0004 established.
--
-- DEFAULT 450 bps: the resolver falls back to a global 450-bps / power row when none exists
-- (lib/odds/pricing-config.DEFAULT_PRICING_ROW), so current pricing reproduces EXACTLY with zero
-- configured rows. An operator's first edit seeds an explicit global row.

create table if not exists pricing_config (
  id                 text primary key,
  owner              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id          text,
  scope              text not null default 'global'
                       check (scope in ('global', 'sport', 'market')),
  sport_id           text,                         -- SGO sportID (sport/market scope)
  market_type        text                          -- moneyline | spread | total | prop (market scope)
                       check (market_type is null or market_type in ('moneyline','spread','total','prop')),
  devig_method       text not null default 'power'
                       check (devig_method in ('multiplicative','additive','power','shin')),
  -- calibrated default: 1318 bps (haircut rate on the fair line) reproduces today's legacy
  -- published hold (~7.06% on a -110/-110 2-way) once the principled pipeline is live.
  margin_bps         integer not null default 1318 check (margin_bps >= 0 and margin_bps <= 5000),
  -- manager governance floor: the lowest margin_bps an agent may set (read off the global row)
  margin_floor_bps   integer not null default 200 check (margin_floor_bps >= 0 and margin_floor_bps <= 5000),
  posture            text not null default 'recreational'
                       check (posture in ('sharp','balanced','recreational','custom')),
  favorite_shade_bps integer not null default 0 check (favorite_shade_bps >= 0 and favorite_shade_bps <= 2000),
  updated_at         timestamptz not null default now(),
  -- one row per (owner, scope, sport, market) — the resolver's identity key
  unique (owner, scope, sport_id, market_type)
);
create index if not exists pricing_config_owner_idx  on pricing_config (owner);
create index if not exists pricing_config_tenant_idx on pricing_config (tenant_id);

-- ── RLS: client-owned, full CRUD scoped to the owner (operator-authored, non-money) ──
revoke all on pricing_config from anon, authenticated;
alter table pricing_config enable row level security;
grant select, insert, update, delete on pricing_config to authenticated;

create policy pricing_config_rw on pricing_config
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
