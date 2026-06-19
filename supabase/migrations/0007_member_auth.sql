-- DimeBag-Bets — multi-user book authorization (CLAUDE.md §3, §5, §6).
--
-- WHY: 0003_money_rpcs.sql authorizes every money RPC with `_assert_owns` — the caller must
-- OWN the account. That is exactly right for the SHIPPED single-operator model (the operator
-- owns every account in their book), but it is NOT a role check. The instant individual
-- players get their own logins (each player a separate auth user owning their own account), a
-- player could call grant_bonus / adjust_balance / resolve_wager on their OWN account and pay
-- themselves arbitrarily. This migration adds the role layer the 0004_tenancy.sql sketch
-- promised, so operator-only money ops require an operator role — WITHOUT changing the
-- single-operator deployment (which has no memberships and keeps falling back to ownership).
--
-- TWO new pieces:
--   1. `book_members` — maps an auth user → (book/tenant, role, the org member they ARE).
--   2. `_assert_operator` / `_member_role` — role checks that the money RPCs use instead of
--      bare ownership for operator-only ops. Backward-compatible by construction.
--
-- Plus a `service_resolve_wager` the server-side fair grader (api/resolve-bet.ts) calls under
-- the service role to settle a player's bet from the SERVER-derived outcome — so a player's
-- win is never graded by a client-supplied multiplier.

set search_path = public, pg_temp;

-- ── book_members: who may act in which book, and as what ─────────────────────────
-- One row per (auth user, book). `member_id` links the login to its org node (the player
-- account they are, or the operator node they manage from). Empty in the single-operator
-- model — the operator just owns the rows — so existing books are unaffected.
create table if not exists book_members (
  tenant_id  text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('manager', 'subagent', 'agent', 'player')),
  member_id  text references org_members (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index if not exists book_members_user_idx   on book_members (user_id);
create index if not exists book_members_tenant_idx on book_members (tenant_id);

alter table book_members enable row level security;
revoke all on book_members from anon, authenticated;
-- A user may read only their OWN memberships (which books/roles they hold). Memberships are
-- written by the operator/server (service role), never by a client — so no write policy.
grant select on book_members to authenticated;
create policy book_members_read_own on book_members
  for select to authenticated using (user_id = auth.uid());

-- ── role helpers ─────────────────────────────────────────────────────────────────
-- The caller's role in a given book, or NULL if they are not a member of it.
create or replace function _member_role(p_tenant text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select role from book_members where user_id = auth.uid() and tenant_id is not distinct from p_tenant
$$;

-- Assert the caller may perform an OPERATOR-only money op on this account.
--   • Legacy single-operator book (no memberships for the account's tenant): fall back to
--     ownership — the owner IS the operator, preserving today's behaviour byte-for-byte.
--   • Multi-user book (memberships exist): require an operator role (manager/subagent/agent);
--     a 'player' (or a non-member) is refused. This is what blocks a player self-crediting.
create or replace function _assert_operator(p_account_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tenant text; v_has_members boolean; v_role text;
begin
  select tenant_id into v_tenant from accounts where id = p_account_id;
  if not found then raise exception 'unknown account %', p_account_id; end if;

  select exists(select 1 from book_members where tenant_id is not distinct from v_tenant)
    into v_has_members;

  if not v_has_members then
    perform _assert_owns(p_account_id);   -- single-operator: ownership == operator
    return;
  end if;

  v_role := _member_role(v_tenant);
  if v_role is null or v_role = 'player' then
    raise exception 'operator privilege required for account %', p_account_id using errcode = '42501';
  end if;
end;
$$;

-- ── re-gate the operator-only money RPCs ─────────────────────────────────────────
-- grant_bonus / adjust_balance / settle_week move the figure OUTSIDE a player's own action
-- (the house giving, an operator correction, the weekly close). They must be operator-only.
-- We REPLACE only the authorization line; the arithmetic is unchanged from 0003.
create or replace function grant_bonus(p_account_id text, p_cents bigint, p_meta jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts;
begin
  perform _assert_operator(p_account_id);           -- was _assert_owns
  if p_cents is null or p_cents <= 0 then raise exception 'grant must be positive, got %', p_cents; end if;
  select * into a from accounts where id = p_account_id for update;
  if not found then raise exception 'unknown account %', p_account_id; end if;
  update accounts set balance = balance + p_cents where id = a.id returning * into a;
  insert into ledger (account_id, kind, balance_delta, pending_delta, balance_after, pending_after, meta)
    values (a.id, 'grant', p_cents, 0, a.balance, a.pending, p_meta);
  return _money_envelope(a, null::wagers);
end;
$$;

create or replace function adjust_balance(p_account_id text, p_delta bigint, p_meta jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts;
begin
  perform _assert_operator(p_account_id);           -- was _assert_owns
  select * into a from accounts where id = p_account_id for update;
  if not found then raise exception 'unknown account %', p_account_id; end if;
  update accounts set balance = balance + p_delta where id = a.id returning * into a;
  insert into ledger (account_id, kind, balance_delta, pending_delta, balance_after, pending_after, meta)
    values (a.id, 'adjust', p_delta, 0, a.balance, a.pending, p_meta);
  return _money_envelope(a, null::wagers);
end;
$$;

create or replace function settle_week(p_account_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts; v_before bigint;
begin
  perform _assert_operator(p_account_id);           -- was _assert_owns
  select * into a from accounts where id = p_account_id for update;
  if not found then raise exception 'unknown account %', p_account_id; end if;
  if a.pending <> 0 then raise exception 'cannot settle with % still pending; grade all wagers first', a.pending; end if;
  v_before := a.balance;
  insert into settlements (account_id, balance_before) values (a.id, v_before);
  update accounts set balance = 0 where id = a.id returning * into a;
  insert into ledger (account_id, kind, balance_delta, pending_delta, balance_after, pending_after)
    values (a.id, 'settle', -v_before, 0, 0, 0);
  return _money_envelope(a, null::wagers);
end;
$$;

-- resolve_wager stays available to authenticated for the single-operator book (the operator
-- grades their own book) and for operators in a multi-user book, but a PLAYER must never grade
-- their own wager — so it is now operator-gated too. A player's win is settled server-side by
-- `service_resolve_wager` below, from the seed-derived multiplier, never a client number.
create or replace function resolve_wager(p_account_id text, p_wager_id text, p_outcome text, p_multiplier double precision default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts; w wagers; v_profit bigint; v_mult double precision; v_eff double precision;
begin
  perform _assert_operator(p_account_id);           -- was _assert_owns
  select * into w from wagers where id = p_wager_id for update;
  if not found then raise exception 'unknown wager %', p_wager_id; end if;
  if w.status = 'resolved' then raise exception 'wager % is already resolved', p_wager_id; end if;
  if w.account_id <> p_account_id then raise exception 'wager % does not belong to account %', p_wager_id, p_account_id; end if;
  if p_outcome = 'win' and (p_multiplier is null or p_multiplier <= 1) then
    raise exception 'a win needs a payoutMultiplier > 1, got %', p_multiplier; end if;
  select * into a from accounts where id = p_account_id for update;

  update accounts set pending = pending - w.stake where id = a.id returning * into a;
  v_profit := 0; v_mult := 1; v_eff := null;
  if p_outcome = 'win' then
    v_profit := round(w.stake * (p_multiplier - 1));
    v_eff := p_multiplier;
    if a.max_payout is not null and v_profit > a.max_payout then
      v_profit := a.max_payout;
      v_eff := case when w.stake > 0 then 1 + v_profit::double precision / w.stake else p_multiplier end;
    end if;
    update accounts set balance = balance + v_profit where id = a.id returning * into a;
    v_mult := v_eff;
  elsif p_outcome = 'loss' then
    update accounts set balance = balance - w.stake where id = a.id returning * into a;
    v_profit := -w.stake; v_mult := 0;
  end if;

  update wagers set status = 'resolved', outcome = p_outcome,
                    payout_multiplier = case when p_outcome = 'win' then v_eff else null end,
                    resolved_at = now()
    where id = w.id returning * into w;
  insert into ledger (account_id, wager_id, kind, balance_delta, pending_delta, balance_after, pending_after, outcome, multiplier)
    values (a.id, w.id, 'resolve', v_profit, -w.stake, a.balance, a.pending, p_outcome, v_mult);
  return _money_envelope(a, w);
end;
$$;

-- place_wager is intentionally NOT re-gated: a player placing their OWN bet is correct, so it
-- keeps the `_assert_owns` ownership check from 0003.

-- ── service-only grade-from-seed settlement (the player win path) ─────────────────
-- Called ONLY by the server-side fair grader (api/resolve-bet.ts) under the SERVICE ROLE,
-- which bypasses RLS and auth.uid(). It carries no auth.uid() check (there is none under the
-- service role) and is therefore granted to NOBODY in the authenticated/anon roles — only the
-- service key can reach it. The multiplier here is the SERVER's seed-derived result, so a
-- tampered client can never declare its own win: it can place a bet, but the outcome is graded
-- by the platform. Arithmetic mirrors resolve_wager / resolve_at_multiplier exactly.
create or replace function service_resolve_wager(p_wager_id text, p_outcome text, p_multiplier double precision default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts; w wagers; v_profit bigint; v_mult double precision; v_eff double precision;
begin
  select * into w from wagers where id = p_wager_id for update;
  if not found then raise exception 'unknown wager %', p_wager_id; end if;
  if w.status = 'resolved' then raise exception 'wager % is already resolved', p_wager_id; end if;
  if p_outcome = 'win' and (p_multiplier is null or p_multiplier <= 1) then
    raise exception 'a win needs a payoutMultiplier > 1, got %', p_multiplier; end if;
  select * into a from accounts where id = w.account_id for update;

  update accounts set pending = pending - w.stake where id = a.id returning * into a;
  v_profit := 0; v_mult := 1; v_eff := null;
  if p_outcome = 'win' then
    v_profit := round(w.stake * (p_multiplier - 1));
    v_eff := p_multiplier;
    if a.max_payout is not null and v_profit > a.max_payout then
      v_profit := a.max_payout;
      v_eff := case when w.stake > 0 then 1 + v_profit::double precision / w.stake else p_multiplier end;
    end if;
    update accounts set balance = balance + v_profit where id = a.id returning * into a;
    v_mult := v_eff;
  elsif p_outcome = 'loss' then
    update accounts set balance = balance - w.stake where id = a.id returning * into a;
    v_profit := -w.stake; v_mult := 0;
  end if;

  update wagers set status = 'resolved', outcome = p_outcome,
                    payout_multiplier = case when p_outcome = 'win' then v_eff else null end,
                    resolved_at = now()
    where id = w.id returning * into w;
  insert into ledger (account_id, wager_id, kind, balance_delta, pending_delta, balance_after, pending_after, outcome, multiplier, actor)
    values (a.id, w.id, 'resolve', v_profit, -w.stake, a.balance, a.pending, p_outcome, v_mult, 'fair-grader');
  return _money_envelope(a, w);
end;
$$;

-- Lock the service grader to the service role only (no client may grade a win).
revoke execute on function service_resolve_wager(text, text, double precision) from public, anon, authenticated;

-- ── multi-user READ scoping (additive; no effect on single-operator books) ────────
-- An OPERATOR (manager/subagent/agent) reads every account in a book they belong to. Players
-- already read only their own via accounts_read_own (owner = auth.uid()) from 0002. This new
-- policy is permissive (OR'd with the existing one), so it only ADDS operator visibility.
create policy accounts_read_operator on accounts
  for select to authenticated
  using (
    tenant_id is not null
    and exists (
      select 1 from book_members bm
      where bm.user_id = auth.uid()
        and bm.tenant_id = accounts.tenant_id
        and bm.role in ('manager', 'subagent', 'agent')
    )
  );
