-- DimeBag-Bets — responsible-play self-limits. Backs the responsible-play/ module.
--
-- A player sets their OWN guardrails on their OWN account: a wager cap, a loss cap (per day or
-- week), a self-exclusion cool-off, and a soft session reminder. ENFORCEMENT is a gate in
-- core.placeWager (assertWithinLimits) — these rows are POLICY only; they move NO money and
-- never touch accounts/wagers/the ledger or the SECURITY DEFINER money RPCs in 0003.
--
-- RESPONSIBLE-PLAY DIRECTION: tightening a limit is effective immediately; loosening (raising a
-- cap, removing one, shortening a cool-off) is scheduled out, which is why a row carries both
-- `set_at` and a separate `effective_at`. A queued loosening is just a second row whose
-- `effective_at` is in the future; the strictest currently-effective row of each kind governs.
--
-- Like the rest of the app, the no-keys deployment persists this in the kv_documents blob
-- (namespace 'dimebag', key 'responsible.limits'); this table is the relational shape for a
-- keyed deployment. Additive + OFF-BY-DEFAULT: with no Supabase keys nothing here is ever
-- touched and the local app is byte-identical; with no row for a player, placement is unchanged.
--
-- SCOPING: persisted under the book owner (owner = auth.uid()) with a tenant_id for the per-book
-- isolation 0004 established — matching every other store. `player_id` back-references the org
-- member the limit belongs to; ON DELETE CASCADE since a removed player has no limits to keep.

-- ── player_limits ────────────────────────────────────────────────────────────────
create table if not exists player_limits (
  id            text primary key,
  owner         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id     text,
  player_id     text not null references org_members (id) on delete cascade,
  kind          text not null check (kind in ('wager', 'loss', 'session', 'cooloff')),
  -- wager/loss/session bucket; null for a cool-off (which is a fixed window, not a period).
  period        text check (period in ('day', 'week')),
  -- wager/loss cap in integer cents; for a session limit this is the reminder interval in
  -- MINUTES (reused magnitude, never money); null for a cool-off.
  amount_cents  bigint check (amount_cents is null or amount_cents >= 0),
  -- cool-off only: the epoch the self-exclusion runs to (timestamptz); null otherwise.
  until         timestamptz,
  set_at        timestamptz not null default now(),
  -- when this row takes effect: now() for a tighten, a future time for a queued loosening.
  effective_at  timestamptz not null default now()
);
create index if not exists player_limits_owner_idx  on player_limits (owner);
create index if not exists player_limits_tenant_idx on player_limits (tenant_id);
create index if not exists player_limits_player_idx on player_limits (player_id);

-- ── RLS: client-owned, full CRUD scoped to the book owner (player-owned, non-figure) ──
revoke all on player_limits from anon, authenticated;
alter table player_limits enable row level security;
grant select, insert, update, delete on player_limits to authenticated;

-- drop-before-create so the policy block is rerunnable (create policy is not idempotent).
drop policy if exists player_limits_rw on player_limits;
create policy player_limits_rw on player_limits
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
