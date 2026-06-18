-- DimeBag-Bets — provably-fair durable seed store (CLAUDE.md §6).
--
-- Backs B-round-1's `createStoredVault` (core/fairness-authority.ts — the SeedStore seam
-- declared "fulfilled by a Supabase-backed table once provisioned"). One row per issued
-- server seed: the platform commits a hash BEFORE play, stores the seed here, and reveals it
-- AFTER play through the server endpoint (api/fairness.ts). This is the per-round randomness +
-- audit-trail alternative to the stateless derived vault.
--
-- SECURITY — server-only, stricter than the money tables. A server seed is a SECRET until
-- reveal: a client that could read an unrevealed seed could pre-compute the outcome and beat
-- the house. So RLS is enabled with NO policies and NO grants to anon/authenticated — clients
-- can neither read nor write this table. Only the `service_role` (the fairness endpoint, which
-- bypasses RLS) touches it. This is DELIBERATELY not the read-own `kv_documents` table (whose
-- `kv_read_own` policy lets a client read its own rows) — seeds must never be client-visible.
--
-- OFF BY DEFAULT — with no Supabase keys the authority uses the stateless DERIVED vault and
-- never touches this table, so the no-backend behaviour is byte-for-byte unchanged.

create table if not exists fairness_seeds (
  commit_id    text primary key,
  server_seed  text not null,
  created_at   timestamptz not null default now(),
  -- optional audit: when the seed was disclosed for verification (the endpoint may stamp it).
  revealed_at  timestamptz
);

-- Take away every default grant, then lock with RLS that has NO client policies.
-- (No grants + RLS enabled ⇒ anon/authenticated get nothing; only service_role reaches it.)
revoke all on fairness_seeds from anon, authenticated;
alter table fairness_seeds enable row level security;
