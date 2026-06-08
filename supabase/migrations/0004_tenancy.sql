-- DimeBag-Bets — multi-tenant scoping (CLAUDE.md §5, §6).
--
-- Each manager is a fully isolated BOOK (a tenant). This migration adds an explicit
-- `tenant_id` to the book-owned tables so a book's rows can be addressed and policed as
-- a unit, and documents how isolation holds in both deployment shapes.
--
-- TWO LAYERS OF ISOLATION (belt-and-braces):
--   1. OWNER (already in 0002_rls.sql): every row is scoped to `owner = auth.uid()`. In
--      the single-operator-per-book model the app ships, the operator IS the tenant, so
--      owner-scoping ALONE already means two operators can never read each other's rows.
--   2. TENANT (this file): `tenant_id` names the book explicitly. It is what the LOCAL
--      layer already encodes in the storage namespace (`dimebag~t~<tenant>` — see
--      persistence/tenant.ts), and it is the key a FUTURE multi-user book needs: when
--      sub-agents/players are their OWN auth users who must see only their book, RLS
--      scopes by tenant membership instead of by owner (sketch at the bottom).
--
-- Additive + backward-compatible: every column is nullable (NULL = the default book), so
-- existing rows and the no-keys app are unchanged. No data migration required.

-- ── tenant_id on the book-owned tables ──────────────────────────────────────────
alter table accounts     add column if not exists tenant_id text;
alter table org_members  add column if not exists tenant_id text;
alter table vip_config   add column if not exists tenant_id text;
alter table vip_players  add column if not exists tenant_id text;
-- kv_documents already separates books by `namespace` (which carries the tenant); add
-- the explicit column too so a book's blobs can be addressed without parsing the name.
alter table kv_documents add column if not exists tenant_id text;

create index if not exists accounts_tenant_idx     on accounts (tenant_id);
create index if not exists org_members_tenant_idx  on org_members (tenant_id);
create index if not exists kv_documents_tenant_idx on kv_documents (tenant_id);

-- wagers / ledger / settlements inherit their tenant via account_id → accounts.tenant_id
-- (no denormalised column needed; join when a per-book report wants it).

-- ── tenant claim helper ─────────────────────────────────────────────────────────
-- The active book id from the JWT (Supabase puts custom claims under request.jwt.claims).
-- Returns NULL when unset → the default book. // TODO(api): set this claim at login from
-- the operator's org membership, mirroring setActiveTenant(user.tenantId) on the client.
create or replace function active_tenant() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id', '')
$$;

-- ── RLS NOTES (no policy change required for the shipped model) ───────────────────
-- The existing owner=auth.uid() policies (0002_rls.sql) already isolate tenants for the
-- single-operator-per-book deployment: a different operator authenticates as a different
-- auth.uid() and sees none of another book's rows. The money tables remain write-only via
-- the SECURITY DEFINER RPCs, so tenancy adds no new way for a client to move a figure.
--
-- FUTURE (multi-user book): when a book's sub-agents/players are separate auth users, add
-- a `book_members(tenant_id, user_id)` table and scope reads by BOTH the tenant claim and
-- membership, e.g.:
--
--   create policy accounts_read_tenant on accounts for select to authenticated
--     using (
--       tenant_id = active_tenant()
--       and exists (select 1 from book_members bm
--                   where bm.tenant_id = accounts.tenant_id and bm.user_id = auth.uid())
--     );
--
-- That makes two operators' books provably isolated even when many users share one book —
-- the same guarantee the LOCAL namespace separation gives today.
