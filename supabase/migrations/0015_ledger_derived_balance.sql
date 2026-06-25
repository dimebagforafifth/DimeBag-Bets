-- DimeBag-Bets — ledger-derived balance (CLAUDE.md §3, balance model decision).
--
-- Flips accounts.balance from direct-mutation to ledger-first. The ledger is the
-- single source of truth: every point movement writes a ledger row first, then
-- accounts.balance is recomputed from sum(balance_delta). This gives a complete,
-- tamper-evident audit trail and lets any drift be corrected by reconcile_balance().
--
-- Because sum(balance_delta) over ALL time always equals the current balance —
--   grants/adjusts add their delta; resolves add profit or subtract stake;
--   settles subtract v_before (driving balance to 0); places add 0 —
-- no "since last settle" boundary logic is needed.
--
-- All money RPCs from 0003_money_rpcs.sql are replaced here with ledger-first
-- versions. The function signatures are identical; callers see no change.

set search_path = public, pg_temp;

-- ── helpers ───────────────────────────────────────────────────────────────────

create or replace function recompute_balance(p_account_id text)
returns bigint language sql stable as $$
  select coalesce(sum(balance_delta), 0) from ledger where account_id = p_account_id
$$;

create or replace function recompute_pending(p_account_id text)
returns bigint language sql stable as $$
  select coalesce(sum(pending_delta), 0) from ledger where account_id = p_account_id
$$;

-- Operator utility: correct any cache drift by recomputing from the ledger.
-- Call this if accounts.balance ever diverges from the ledger sum.
create or replace function reconcile_balance(p_account_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts;
begin
  select * into a from accounts where id = p_account_id for update;
  if not found then raise exception 'unknown account %', p_account_id; end if;
  update accounts
     set balance    = recompute_balance(p_account_id),
         pending    = recompute_pending(p_account_id),
         updated_at = now()
   where id = p_account_id
  returning * into a;
  return jsonb_build_object('id', a.id, 'balance', a.balance, 'pending', a.pending);
end;
$$;

-- ── place: hold a stake ────────────────────────────────────────────────────────
create or replace function place_wager(p_account_id text, p_stake bigint, p_wager_id text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts; w wagers; v_available bigint; v_id text;
begin
  perform _assert_owns(p_account_id);
  select * into a from accounts where id = p_account_id for update;
  if not found then raise exception 'unknown account %', p_account_id; end if;
  if p_stake <= 0 then raise exception 'stake must be positive, got %', p_stake; end if;
  if a.betting_locked then raise exception 'betting is locked on this account'; end if;
  v_available := a.credit_limit + a.balance - a.pending;
  if p_stake > v_available then raise exception 'stake % exceeds availableToWager %', p_stake, v_available; end if;
  if a.max_wager is not null and p_stake > a.max_wager then raise exception 'stake exceeds the max bet'; end if;
  if a.min_wager is not null and p_stake < a.min_wager then raise exception 'stake is below the minimum bet'; end if;

  v_id := coalesce(p_wager_id, 'w_' || nextval('wager_seq'));
  insert into wagers (id, account_id, stake, status) values (v_id, a.id, p_stake, 'open') returning * into w;
  -- Ledger first: pending increases, balance unchanged.
  insert into ledger (account_id, wager_id, kind, balance_delta, pending_delta, balance_after, pending_after)
    values (a.id, w.id, 'place', 0, p_stake, a.balance, a.pending + p_stake);
  -- Derive pending from ledger; balance unchanged so skip recomputing it.
  update accounts set pending = recompute_pending(a.id), updated_at = now() where id = a.id returning * into a;
  return _money_envelope(a, w);
end;
$$;

-- ── resolve: grade win/loss/push/void ─────────────────────────────────────────
create or replace function resolve_wager(p_account_id text, p_wager_id text, p_outcome text, p_multiplier double precision default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts; w wagers; v_profit bigint; v_mult double precision; v_eff double precision;
begin
  perform _assert_owns(p_account_id);
  select * into w from wagers where id = p_wager_id for update;
  if not found then raise exception 'unknown wager %', p_wager_id; end if;
  if w.status = 'resolved' then raise exception 'wager % is already resolved', p_wager_id; end if;
  if w.account_id <> p_account_id then raise exception 'wager % does not belong to account %', p_wager_id, p_account_id; end if;
  if p_outcome = 'win' and (p_multiplier is null or p_multiplier <= 1) then
    raise exception 'a win needs a payoutMultiplier > 1, got %', p_multiplier; end if;
  select * into a from accounts where id = p_account_id for update;

  -- Compute deltas before touching anything.
  v_profit := 0; v_mult := 1; v_eff := null;
  if p_outcome = 'win' then
    v_profit := round(w.stake * (p_multiplier - 1));
    v_eff    := p_multiplier;
    if a.max_payout is not null and v_profit > a.max_payout then
      v_profit := a.max_payout;
      v_eff    := case when w.stake > 0 then 1 + v_profit::double precision / w.stake else p_multiplier end;
    end if;
    v_mult := v_eff;
  elsif p_outcome = 'loss' then
    v_profit := -w.stake; v_mult := 0;
  end if;

  update wagers set status = 'resolved', outcome = p_outcome,
                    payout_multiplier = case when p_outcome = 'win' then v_eff else null end,
                    resolved_at = now()
    where id = w.id returning * into w;
  -- Ledger first: release hold (pending -= stake) and apply balance delta.
  insert into ledger (account_id, wager_id, kind, balance_delta, pending_delta, balance_after, pending_after, outcome, multiplier)
    values (a.id, w.id, 'resolve', v_profit, -w.stake,
            a.balance + v_profit, a.pending - w.stake, p_outcome, v_mult);
  -- Derive both balance and pending from ledger.
  update accounts
     set balance    = recompute_balance(a.id),
         pending    = recompute_pending(a.id),
         updated_at = now()
   where id = a.id
  returning * into a;
  return _money_envelope(a, w);
end;
$$;

-- ── resolveAt: settle at an arbitrary return multiple ─────────────────────────
create or replace function resolve_at_multiplier(p_account_id text, p_wager_id text, p_multiplier double precision)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts; w wagers; v_profit bigint; v_eff double precision; v_outcome text;
begin
  perform _assert_owns(p_account_id);
  select * into w from wagers where id = p_wager_id for update;
  if not found then raise exception 'unknown wager %', p_wager_id; end if;
  if w.status = 'resolved' then raise exception 'wager % is already resolved', p_wager_id; end if;
  if w.account_id <> p_account_id then raise exception 'wager % does not belong to account %', p_wager_id, p_account_id; end if;
  if p_multiplier is null or p_multiplier < 0 then raise exception 'multiplier must be a finite number >= 0, got %', p_multiplier; end if;
  select * into a from accounts where id = p_account_id for update;

  v_profit  := round(w.stake * (p_multiplier - 1));
  v_eff     := p_multiplier;
  if a.max_payout is not null and v_profit > a.max_payout then
    v_profit := a.max_payout;
    v_eff    := case when w.stake > 0 then 1 + v_profit::double precision / w.stake else p_multiplier end;
  end if;
  v_outcome := case when p_multiplier > 1 then 'win' when p_multiplier < 1 then 'loss' else 'push' end;

  update wagers set status = 'resolved', outcome = v_outcome, payout_multiplier = v_eff, resolved_at = now()
    where id = w.id returning * into w;
  insert into ledger (account_id, wager_id, kind, balance_delta, pending_delta, balance_after, pending_after, outcome, multiplier)
    values (a.id, w.id, 'resolve', v_profit, -w.stake,
            a.balance + v_profit, a.pending - w.stake, v_outcome,
            case when v_outcome = 'loss' then 0 else v_eff end);
  update accounts
     set balance    = recompute_balance(a.id),
         pending    = recompute_pending(a.id),
         updated_at = now()
   where id = a.id
  returning * into a;
  return _money_envelope(a, w);
end;
$$;

-- ── grant: credit a bonus ─────────────────────────────────────────────────────
create or replace function grant_bonus(p_account_id text, p_cents bigint, p_meta jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts;
begin
  perform _assert_owns(p_account_id);
  if p_cents is null or p_cents <= 0 then raise exception 'grant must be positive, got %', p_cents; end if;
  select * into a from accounts where id = p_account_id for update;
  if not found then raise exception 'unknown account %', p_account_id; end if;
  insert into ledger (account_id, kind, balance_delta, pending_delta, balance_after, pending_after, meta)
    values (a.id, 'grant', p_cents, 0, a.balance + p_cents, a.pending, p_meta);
  update accounts
     set balance    = recompute_balance(a.id),
         updated_at = now()
   where id = a.id
  returning * into a;
  return _money_envelope(a, null::wagers);
end;
$$;

-- ── adjust: operator correction ───────────────────────────────────────────────
create or replace function adjust_balance(p_account_id text, p_delta bigint, p_meta jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts;
begin
  perform _assert_owns(p_account_id);
  select * into a from accounts where id = p_account_id for update;
  if not found then raise exception 'unknown account %', p_account_id; end if;
  insert into ledger (account_id, kind, balance_delta, pending_delta, balance_after, pending_after, meta)
    values (a.id, 'adjust', p_delta, 0, a.balance + p_delta, a.pending, p_meta);
  update accounts
     set balance    = recompute_balance(a.id),
         updated_at = now()
   where id = a.id
  returning * into a;
  return _money_envelope(a, null::wagers);
end;
$$;

-- ── settle: weekly square-up ──────────────────────────────────────────────────
create or replace function settle_week(p_account_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts; v_before bigint;
begin
  perform _assert_owns(p_account_id);
  select * into a from accounts where id = p_account_id for update;
  if not found then raise exception 'unknown account %', p_account_id; end if;
  if a.pending <> 0 then raise exception 'cannot settle with % still pending; grade all wagers first', a.pending; end if;
  v_before := a.balance;
  insert into settlements (account_id, balance_before) values (a.id, v_before);
  -- settle delta cancels the running balance (driving sum back to 0 after recompute).
  insert into ledger (account_id, kind, balance_delta, pending_delta, balance_after, pending_after)
    values (a.id, 'settle', -v_before, 0, 0, 0);
  update accounts
     set balance    = recompute_balance(a.id),
         updated_at = now()
   where id = a.id
  returning * into a;
  return _money_envelope(a, null::wagers);
end;
$$;

-- ── grants ────────────────────────────────────────────────────────────────────
revoke execute on function reconcile_balance(text) from public;
grant  execute on function reconcile_balance(text) to authenticated;
-- recompute_* are internal helpers; no direct client grant needed.
revoke execute on function recompute_balance(text) from public;
revoke execute on function recompute_pending(text) from public;
