-- DimeBag-Bets — server-authoritative money path (CLAUDE.md §3).
--
-- These SECURITY DEFINER functions are the ONLY way the figure moves. They recompute
-- every result from the stored row (the client sends a request, never a balance) and
-- run the exact same arithmetic as `core/core.ts` — place / resolve / resolveAt /
-- grant / adjust / settle. Because clients have no write grant on the money tables
-- (0002_rls.sql), a tampered browser cannot fabricate or overwrite a figure; it can
-- only ask these functions, which validate first. The provably-fair RNG stays in core.
--
-- KEEP IN SYNC with core/core.ts and persistence/supabase/fake-server.ts (the test
-- double runs core itself; this is the production copy of that math).

set search_path = public, pg_temp;

-- The {account, wager?} envelope every money RPC returns (matches money/rpc.ts).
create or replace function _money_envelope(a accounts, w wagers)
returns jsonb language sql immutable as $$
  select jsonb_build_object('account', jsonb_build_object(
           'id', a.id, 'credit_limit', a.credit_limit, 'balance', a.balance,
           'pending', a.pending, 'max_wager', a.max_wager, 'min_wager', a.min_wager,
           'max_payout', a.max_payout, 'betting_locked', a.betting_locked))
       || case when w.id is not null then jsonb_build_object('wager', jsonb_build_object(
           'id', w.id, 'account_id', w.account_id, 'stake', w.stake, 'status', w.status,
           'outcome', w.outcome, 'payout_multiplier', w.payout_multiplier))
          else '{}'::jsonb end;
$$;

-- Authorize: the caller must own the account. In this single-operator book model all
-- of a book's accounts share one owner (the operator), so this guards every op.
create or replace function _assert_owns(p_account_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from accounts where id = p_account_id and owner = auth.uid()) then
    raise exception 'not authorized for account %', p_account_id using errcode = '42501';
  end if;
end;
$$;

-- ── place: hold a stake (core.placeWager) ───────────────────────────────────────
create or replace function place_wager(p_account_id text, p_stake bigint, p_wager_id text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts; w wagers; v_available bigint; v_id text;
begin
  perform _assert_owns(p_account_id);
  select * into a from accounts where id = p_account_id for update;
  if not found then raise exception 'unknown account %', p_account_id; end if;
  if p_stake <= 0 then raise exception 'stake must be positive, got %', p_stake; end if;  -- bigint => always integer
  if a.betting_locked then raise exception 'betting is locked on this account'; end if;
  v_available := a.credit_limit + a.balance - a.pending;
  if p_stake > v_available then raise exception 'stake % exceeds availableToWager %', p_stake, v_available; end if;
  if a.max_wager is not null and p_stake > a.max_wager then raise exception 'stake exceeds the max bet'; end if;
  if a.min_wager is not null and p_stake < a.min_wager then raise exception 'stake is below the minimum bet'; end if;

  update accounts set pending = pending + p_stake, updated_at = now() where id = a.id returning * into a;
  v_id := coalesce(p_wager_id, 'w_' || nextval('wager_seq'));
  insert into wagers (id, account_id, stake, status) values (v_id, a.id, p_stake, 'open') returning * into w;
  insert into ledger (account_id, wager_id, kind, balance_delta, pending_delta, balance_after, pending_after)
    values (a.id, w.id, 'place', 0, p_stake, a.balance, a.pending);
  return _money_envelope(a, w);
end;
$$;

-- ── resolve: grade win/loss/push/void (core.resolveWager) ───────────────────────
create or replace function resolve_wager(p_account_id text, p_wager_id text, p_outcome text, p_multiplier double precision default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts; w wagers; v_profit bigint; v_mult double precision; v_eff double precision;
begin
  perform _assert_owns(p_account_id);
  select * into w from wagers where id = p_wager_id for update;
  if not found then raise exception 'unknown wager %', p_wager_id; end if;
  if w.status = 'resolved' then raise exception 'wager % is already resolved', p_wager_id; end if;
  if w.account_id <> p_account_id then raise exception 'wager % does not belong to account %', p_wager_id, p_account_id; end if;
  -- A win must carry a valid multiplier — validate BEFORE touching the account.
  if p_outcome = 'win' and (p_multiplier is null or p_multiplier <= 1) then
    raise exception 'a win needs a payoutMultiplier > 1, got %', p_multiplier; end if;
  select * into a from accounts where id = p_account_id for update;

  update accounts set pending = pending - w.stake where id = a.id returning * into a;  -- release hold
  v_profit := 0; v_mult := 1; v_eff := null;                                           -- push/void default
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

  -- core only stamps payout_multiplier on a win; leave it null otherwise.
  update wagers set status = 'resolved', outcome = p_outcome,
                    payout_multiplier = case when p_outcome = 'win' then v_eff else null end,
                    resolved_at = now()
    where id = w.id returning * into w;
  insert into ledger (account_id, wager_id, kind, balance_delta, pending_delta, balance_after, pending_after, outcome, multiplier)
    values (a.id, w.id, 'resolve', v_profit, -w.stake, a.balance, a.pending, p_outcome, v_mult);
  return _money_envelope(a, w);
end;
$$;

-- ── resolveAt: settle at an arbitrary return multiple (core.resolveAtMultiplier) ─
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

  update accounts set pending = pending - w.stake where id = a.id returning * into a;
  v_profit := round(w.stake * (p_multiplier - 1));
  v_eff := p_multiplier;
  if a.max_payout is not null and v_profit > a.max_payout then
    v_profit := a.max_payout;
    v_eff := case when w.stake > 0 then 1 + v_profit::double precision / w.stake else p_multiplier end;
  end if;
  update accounts set balance = balance + v_profit where id = a.id returning * into a;
  v_outcome := case when p_multiplier > 1 then 'win' when p_multiplier < 1 then 'loss' else 'push' end;

  update wagers set status = 'resolved', outcome = v_outcome, payout_multiplier = v_eff, resolved_at = now()
    where id = w.id returning * into w;
  insert into ledger (account_id, wager_id, kind, balance_delta, pending_delta, balance_after, pending_after, outcome, multiplier)
    values (a.id, w.id, 'resolve', v_profit, -w.stake, a.balance, a.pending, v_outcome,
            case when v_outcome = 'loss' then 0 else v_eff end);
  return _money_envelope(a, w);
end;
$$;

-- ── grant: credit a bonus (core.grant) ──────────────────────────────────────────
create or replace function grant_bonus(p_account_id text, p_cents bigint, p_meta jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts;
begin
  perform _assert_owns(p_account_id);
  if p_cents is null or p_cents <= 0 then raise exception 'grant must be positive, got %', p_cents; end if;
  select * into a from accounts where id = p_account_id for update;
  if not found then raise exception 'unknown account %', p_account_id; end if;
  update accounts set balance = balance + p_cents where id = a.id returning * into a;
  insert into ledger (account_id, kind, balance_delta, pending_delta, balance_after, pending_after, meta)
    values (a.id, 'grant', p_cents, 0, a.balance, a.pending, p_meta);
  return _money_envelope(a, null::wagers);
end;
$$;

-- ── adjust: operator correction outside the wager flow (core.adjustBalance) ──────
create or replace function adjust_balance(p_account_id text, p_delta bigint, p_meta jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts;
begin
  perform _assert_owns(p_account_id);
  select * into a from accounts where id = p_account_id for update;
  if not found then raise exception 'unknown account %', p_account_id; end if;
  update accounts set balance = balance + p_delta where id = a.id returning * into a;
  insert into ledger (account_id, kind, balance_delta, pending_delta, balance_after, pending_after, meta)
    values (a.id, 'adjust', p_delta, 0, a.balance, a.pending, p_meta);
  return _money_envelope(a, null::wagers);
end;
$$;

-- ── settle: weekly square-up + reset (core.settleWeek) ───────────────────────────
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
  update accounts set balance = 0 where id = a.id returning * into a;
  insert into ledger (account_id, kind, balance_delta, pending_delta, balance_after, pending_after)
    values (a.id, 'settle', -v_before, 0, 0, 0);
  return _money_envelope(a, null::wagers);
end;
$$;

-- ── grants: clients may EXECUTE the money RPCs, nothing else ─────────────────────
-- New functions default to EXECUTE for PUBLIC; lock the internal helpers down and
-- expose only the six money RPCs to authenticated users.
revoke execute on function _money_envelope(accounts, wagers) from public;
revoke execute on function _assert_owns(text) from public;
revoke execute on function place_wager(text, bigint, text) from public;
revoke execute on function resolve_wager(text, text, text, double precision) from public;
revoke execute on function resolve_at_multiplier(text, text, double precision) from public;
revoke execute on function grant_bonus(text, bigint, jsonb) from public;
revoke execute on function adjust_balance(text, bigint, jsonb) from public;
revoke execute on function settle_week(text) from public;

grant execute on function place_wager(text, bigint, text) to authenticated;
grant execute on function resolve_wager(text, text, text, double precision) to authenticated;
grant execute on function resolve_at_multiplier(text, text, double precision) to authenticated;
grant execute on function grant_bonus(text, bigint, jsonb) to authenticated;
grant execute on function adjust_balance(text, bigint, jsonb) to authenticated;
grant execute on function settle_week(text) to authenticated;
