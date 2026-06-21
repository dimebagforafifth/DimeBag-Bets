-- DimeBag-Bets — operator migration & player import (CLAUDE.md §5).
--
-- Backs the import/ module: an operator uploads their legacy book, maps the columns once,
-- previews a dry run, then commits — which creates the players, reconstructs the agent tree,
-- and seeds each opening figure. This migration is the SERVER-SIDE record of those imports.
--
-- Like the other app state, the no-keys app persists import state in the kv_documents blob
-- (namespace 'dimebag', key 'import.state'); these dedicated tables are the relational shape
-- for a keyed deployment, so a batch's rows can be addressed and reported on as a unit. They
-- are additive + off-by-default: with no Supabase keys nothing here is ever touched, and the
-- local app is byte-identical.
--
-- MONEY SAFETY: these tables only RECORD an import (batches, rows, mapping templates). They
-- move no money and create no member by themselves — committing a batch creates the player
-- via the org tree and seeds the figure through the SAME audited core path (accounts + ledger
-- + the SECURITY DEFINER money RPCs in 0003) as every other figure move. `player_id` here is a
-- back-reference to the created org member, never a money write.
--
-- SCOPING: import data is operator-authored, non-money config — so (like kv_documents) it's
-- client-writable CRUD, scoped to owner = auth.uid(), with a tenant_id column for the per-book
-- isolation 0004 established. Two operators can never see each other's imports.

-- ── import_batches ───────────────────────────────────────────────────────────────
create table if not exists import_batches (
  id            text primary key,
  owner         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id     text,
  source_label  text not null,
  status        text not null default 'draft'
                  check (status in ('draft', 'validated', 'committed', 'failed')),
  row_count     integer not null default 0,
  created_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count   integer not null default 0,
  created_by    text not null default '',
  headers       jsonb not null default '[]'::jsonb,
  column_map    jsonb not null default '{}'::jsonb,
  options       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  committed_at  timestamptz
);
create index if not exists import_batches_owner_idx  on import_batches (owner);
create index if not exists import_batches_tenant_idx on import_batches (tenant_id);

-- ── import_rows ──────────────────────────────────────────────────────────────────
-- One row per source line. `raw` = source cells; `mapped` = the canonical player shape;
-- `result` + `error_reason` carry the validate/commit outcome; `player_id` links the created
-- member (and is the idempotency anchor on re-commit). ON DELETE SET NULL so deleting a member
-- never deletes the audit of how they were imported.
create table if not exists import_rows (
  id           text primary key,
  batch_id     text not null references import_batches (id) on delete cascade,
  owner        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  raw          jsonb not null default '{}'::jsonb,
  mapped       jsonb,
  result       text not null default 'pending'
                 check (result in ('pending', 'created', 'skipped', 'error')),
  error_reason text,
  player_id    text references org_members (id) on delete set null
);
create index if not exists import_rows_batch_idx on import_rows (batch_id);
create index if not exists import_rows_owner_idx on import_rows (owner);

-- ── import_mapping_templates ─────────────────────────────────────────────────────
-- A reusable column mapping, so re-importing the same vendor format is one tap.
create table if not exists import_mapping_templates (
  id         text primary key,
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id  text,
  name       text not null,
  column_map jsonb not null default '{}'::jsonb,
  options    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists import_mapping_templates_owner_idx on import_mapping_templates (owner);

-- ── RLS: client-owned, full CRUD scoped to the owner (operator-authored, non-money) ──
revoke all on import_batches            from anon, authenticated;
revoke all on import_rows               from anon, authenticated;
revoke all on import_mapping_templates  from anon, authenticated;

alter table import_batches           enable row level security;
alter table import_rows              enable row level security;
alter table import_mapping_templates enable row level security;

grant select, insert, update, delete on import_batches           to authenticated;
grant select, insert, update, delete on import_rows              to authenticated;
grant select, insert, update, delete on import_mapping_templates to authenticated;

create policy import_batches_rw on import_batches
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy import_rows_rw on import_rows
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy import_templates_rw on import_mapping_templates
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
