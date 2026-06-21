-- DimeBag-Bets — referral / invite loops. Backs the referrals/ module.
--
-- A player invites another with a code; when the referee places their first QUALIFYING settled
-- wager, BOTH get a credit reward GRANTED THROUGH CORE (the grant path, audited via the issuance
-- ledger + audit trail). These rows are the program config + the relationship records ONLY — they
-- move NO money and never touch accounts/wagers/the ledger or the SECURITY DEFINER money RPCs in
-- 0003. `referrer_id`/`referee_id` back-reference org members for the activity view.
--
-- ANTI-ABUSE is enforced in code: one reward per referee (a referee may claim at most one invite),
-- the referrer must be distinct from the referee, and qualifying is gated on REAL settled activity
-- counted from the durable ledger (signup alone never pays).
--
-- Like the rest of the app, the no-keys deployment persists this in the kv_documents blob
-- (namespace 'dimebag', key 'referrals.state'); these tables are the relational shape for a keyed
-- deployment. Additive + OFF-BY-DEFAULT: with no Supabase keys nothing here is touched, and with
-- no program enabled (the default) no row is ever written.
--
-- SCOPING: persisted under the book owner (owner = auth.uid()) with a tenant_id for the per-book
-- isolation 0004 established — matching every other store.

-- ── referral_config ─────────────────────────────────────────────────────────────
-- The operator's program (one row per owner/tenant book). OFF by default.
create table if not exists referral_config (
  id                 text primary key,
  owner              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id          text,
  enabled            boolean not null default false,
  reward_cents       bigint not null default 0 check (reward_cents >= 0),
  min_settled_wagers integer not null default 1 check (min_settled_wagers >= 1),
  updated_at         timestamptz not null default now()
);
create index if not exists referral_config_owner_idx  on referral_config (owner);
create index if not exists referral_config_tenant_idx on referral_config (tenant_id);

-- ── referrals ───────────────────────────────────────────────────────────────────
-- One row per invite relationship. `referee_id` is null until the code is claimed; status walks
-- pending → qualified → rewarded. `reward_cents` is the per-party reward SNAPSHOT at claim time.
create table if not exists referrals (
  id            text primary key,
  owner         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id     text,
  code          text not null,
  referrer_id   text not null references org_members (id) on delete cascade,
  referee_id    text references org_members (id) on delete set null,
  status        text not null default 'pending'
                  check (status in ('pending', 'qualified', 'rewarded')),
  reward_cents  bigint not null default 0 check (reward_cents >= 0),
  created_at    timestamptz not null default now(),
  claimed_at    timestamptz,
  qualified_at  timestamptz
);
create index if not exists referrals_owner_idx    on referrals (owner);
create index if not exists referrals_tenant_idx   on referrals (tenant_id);
create index if not exists referrals_referrer_idx on referrals (referrer_id);
-- A referee may be referred only once (one reward per referee), per owner book.
create unique index if not exists referrals_one_per_referee
  on referrals (owner, referee_id) where referee_id is not null;

-- ── RLS: client-owned, full CRUD scoped to the book owner (program config + relationships) ──
revoke all on referral_config from anon, authenticated;
revoke all on referrals      from anon, authenticated;
alter table referral_config enable row level security;
alter table referrals       enable row level security;
grant select, insert, update, delete on referral_config to authenticated;
grant select, insert, update, delete on referrals      to authenticated;

-- drop-before-create so the policy block is rerunnable (create policy is not idempotent).
drop policy if exists referral_config_rw on referral_config;
create policy referral_config_rw on referral_config
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists referrals_rw on referrals;
create policy referrals_rw on referrals
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
