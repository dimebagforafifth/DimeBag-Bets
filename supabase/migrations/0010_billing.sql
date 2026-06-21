-- DimeBag-Bets — per-head software billing (FIAT). Backs the billing/ module.
--
-- This is the OPERATOR's real-money software cost: the platform charges the Manager (the
-- customer we sell the software to) a weekly fee per ACTIVE player in their downline. A weekly
-- head-count job walks the org tree (reading ACTIVITY, not figures), counts active heads, and
-- prices them into an invoice (billing_period) with a per-head breakdown (billing_head_snapshot).
--
-- ⚠ FIAT / REAL MONEY — NOT THE PLAYER FIGURE, NOT THE LEDGER. Player points are a closed loop
-- with no monetary value (CLAUDE.md §1); these amounts are real US dollars (integer cents) and
-- live ONLY in these tables. Nothing here references accounts / wagers / the ledger, and NOTHING
-- in the billing path ever calls the SECURITY DEFINER money RPCs in 0003. `player_id`/`agent_id`
-- are back-references to org members for the invoice breakdown, never a money write.
--
-- Like the rest of the app, the no-keys deployment persists billing state in the kv_documents
-- blob (namespace 'dimebag', key 'billing.state'); these dedicated tables are the relational
-- shape for a keyed deployment. They are additive + off-by-default: with no Supabase keys nothing
-- here is ever touched and the local app is byte-identical.
--
-- SCOPING: billing is operator-authored config + records — client-writable CRUD scoped to
-- owner = auth.uid(), with a tenant_id column for the per-book isolation 0004 established. Two
-- operators can never see each other's billing.

-- ── billing_config ───────────────────────────────────────────────────────────────
-- The operator's per-head arrangement (one row per owner/tenant book).
create table if not exists billing_config (
  id                       text primary key,
  owner                    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id                text,
  base_rate_cents_per_head bigint not null default 500 check (base_rate_cents_per_head >= 0),
  currency                 text not null default 'USD' check (currency in ('USD')),
  active_definition        jsonb not null default '{"kind":"settled-wager","minSettledWagers":1}'::jsonb,
  tiers                    jsonb not null default '[]'::jsonb,
  addons                   jsonb not null default '[]'::jsonb,
  free_weeks               integer not null default 0 check (free_weeks >= 0),
  seasonal_pause           boolean not null default false,
  crypto_discount_bps      integer not null default 0
                             check (crypto_discount_bps between 0 and 10000),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists billing_config_owner_idx  on billing_config (owner);
create index if not exists billing_config_tenant_idx on billing_config (tenant_id);

-- ── billing_periods ──────────────────────────────────────────────────────────────
-- One weekly invoice. `active_head_count` = billable heads found; `billed_head_count` = heads
-- actually charged (0 on a waived week). All *_cents are FIAT US dollars in integer cents.
create table if not exists billing_periods (
  id                text primary key,
  owner             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id         text,
  week_start        timestamptz not null,
  week_end          timestamptz not null,
  active_head_count integer not null default 0,
  billed_head_count integer not null default 0,
  base_cents        bigint not null default 0,
  addon_cents       bigint not null default 0,
  discount_cents    bigint not null default 0,
  total_cents       bigint not null default 0,
  currency          text not null default 'USD' check (currency in ('USD')),
  status            text not null default 'draft'
                      check (status in ('draft', 'issued', 'paid', 'waived')),
  waived_reason     text check (waived_reason in ('seasonal-pause', 'free-week')),
  -- false when the activity source couldn't be guaranteed to cover the whole week (a capped local
  -- reader); a server transactions reader writes true. Lets the UI flag a possibly-low invoice.
  coverage_complete boolean not null default true,
  created_at        timestamptz not null default now(),
  issued_at         timestamptz,
  paid_at           timestamptz
);
create index if not exists billing_periods_owner_idx  on billing_periods (owner);
create index if not exists billing_periods_tenant_idx on billing_periods (tenant_id);

-- ── billing_head_snapshots ───────────────────────────────────────────────────────
-- One player's billable state captured in a period, so an invoice is auditable head-by-head.
-- Holds NO money (the fee is derived from the count). ON DELETE SET NULL on the member links so
-- deleting a member never deletes the billing audit of how they were counted.
create table if not exists billing_head_snapshots (
  id         text primary key,
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period_id  text not null references billing_periods (id) on delete cascade,
  player_id  text references org_members (id) on delete set null,
  agent_id   text references org_members (id) on delete set null,
  active     boolean not null default false,
  reason     text not null default 'no-activity'
               check (reason in ('settled-wager', 'no-activity', 'inactive'))
);
create index if not exists billing_head_snapshots_period_idx on billing_head_snapshots (period_id);
create index if not exists billing_head_snapshots_owner_idx  on billing_head_snapshots (owner);

-- ── RLS: client-owned, full CRUD scoped to the owner (operator-authored, non-figure) ──
revoke all on billing_config          from anon, authenticated;
revoke all on billing_periods         from anon, authenticated;
revoke all on billing_head_snapshots  from anon, authenticated;

alter table billing_config         enable row level security;
alter table billing_periods        enable row level security;
alter table billing_head_snapshots enable row level security;

grant select, insert, update, delete on billing_config         to authenticated;
grant select, insert, update, delete on billing_periods        to authenticated;
grant select, insert, update, delete on billing_head_snapshots to authenticated;

-- drop-before-create so the policy block is rerunnable (create policy is not idempotent).
drop policy if exists billing_config_rw on billing_config;
create policy billing_config_rw on billing_config
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists billing_periods_rw on billing_periods;
create policy billing_periods_rw on billing_periods
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists billing_head_snapshots_rw on billing_head_snapshots;
create policy billing_head_snapshots_rw on billing_head_snapshots
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
