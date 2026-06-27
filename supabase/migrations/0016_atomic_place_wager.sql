-- DimeBag-Bets — atomic + idempotent placeWager (gap-analysis §1.1, pending-issues item 3 / "G1").
--
-- Hardens the bet-acceptance path against TWO concurrency exploits that become real
-- once the figure lives in Supabase (the in-memory Phase-0 path can't race):
--
--   1. DOUBLE-SPEND via a read-then-write gap. The 0015 place_wager does
--        SELECT ... FOR UPDATE; check available; UPDATE pending
--      The FOR UPDATE row lock makes that safe today, but the *check* and the
--      *reserve* are still two statements. This migration collapses them into ONE
--      atomic statement so acceptance is impossible to interleave:
--        UPDATE accounts SET pending = pending + p_stake
--         WHERE id = p_account_id AND (credit_limit + balance - pending) >= p_stake
--        RETURNING ...
--      If that returns 0 rows the available funds did not cover the stake at the
--      instant of the write => the wager is rejected. There is no window between
--      "is it affordable" and "reserve it".
--
--   2. DOUBLE-SUBMIT replay (double-click, client retry on a flaky network, two
--      tabs). A client-minted idempotency key, UNIQUE per account, makes a repeated
--      placement a no-op: the second call finds the already-created wager and returns
--      it verbatim instead of reserving the stake a second time.
--
-- Ledger-derived invariant (0015) is preserved: we write the ledger row first, then
-- recompute accounts.pending from sum(pending_delta). The ledger stays the source of
-- truth; reconcile_balance() can still repair any drift. The wager id is minted in
-- the DB (wager_seq, keeping the core `w_<n>` shape) when the caller doesn't supply one.
--
-- Signature changes: place_wager gains a trailing optional p_idempotency_key arg, so
-- the old 3-arg signature is dropped and a new 4-arg one is created (+ re-granted).
-- KEEP IN SYNC with core/core.ts, money/rpc.ts, and persistence/supabase/fake-server.ts.
--
-- NOT YET APPLIED to any remote (no remote DB). Clean forward migration.

set search_path = public, pg_temp;

-- ── idempotency key column ──────────────────────────────────────────────────────
-- Client-minted (e.g. a UUID) per placement attempt. Scoped UNIQUE per account so a
-- retried submit collides and we return the original wager. NULL is allowed (and does
-- not participate in the unique index) so callers that don't supply one keep working,
-- but the production client should always mint one to get the replay protection.
alter table wagers add column if not exists idempotency_key text;

create unique index if not exists wagers_account_idempotency_key
  on wagers (account_id, idempotency_key)
  where idempotency_key is not null;

-- ── place: atomic check-and-reserve + idempotent ────────────────────────────────
-- Replaces the 0015 / 0003 read-then-write place_wager. New trailing arg
-- p_idempotency_key; drop the old 3-arg form so only this version is callable.
drop function if exists place_wager(text, bigint, text);

create or replace function place_wager(
  p_account_id      text,
  p_stake           bigint,
  p_wager_id        text default null,
  p_idempotency_key text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a accounts; w wagers; v_id text;
begin
  perform _assert_owns(p_account_id);

  -- Idempotent replay: if this account already placed a wager under this key, this is
  -- a duplicate submit. Return the original wager + the current account, reserving
  -- NOTHING further. Done before any lock/reserve so a retry is a pure no-op.
  if p_idempotency_key is not null then
    select * into w from wagers
      where account_id = p_account_id and idempotency_key = p_idempotency_key;
    if found then
      select * into a from accounts where id = p_account_id;
      return _money_envelope(a, w);
    end if;
  end if;

  -- Validate the inputs and per-account betting policy up front. These don't depend on
  -- the concurrent available balance, so they're safe to check before the atomic step.
  if p_stake <= 0 then raise exception 'stake must be positive, got %', p_stake; end if;  -- bigint => always integer
  select * into a from accounts where id = p_account_id;
  if not found then raise exception 'unknown account %', p_account_id; end if;
  if a.betting_locked then raise exception 'betting is locked on this account'; end if;
  if a.max_wager is not null and p_stake > a.max_wager then raise exception 'stake exceeds the max bet'; end if;
  if a.min_wager is not null and p_stake < a.min_wager then raise exception 'stake is below the minimum bet'; end if;

  -- THE atomic acceptance: check availableToWager and reserve the hold in a single
  -- statement. No SELECT...FOR UPDATE-then-validate gap — two concurrent placements
  -- cannot both pass, because only the row's actual current state is tested at write
  -- time. 0 rows back => the stake did not fit availableToWager => reject.
  update accounts
     set pending    = pending + p_stake,
         updated_at = now()
   where id = p_account_id
     and (credit_limit + balance - pending) >= p_stake
  returning * into a;
  if not found then
    -- Re-read for an accurate figure in the error (the row exists; just couldn't afford).
    select * into a from accounts where id = p_account_id;
    raise exception 'stake % exceeds availableToWager %',
      p_stake, (a.credit_limit + a.balance - a.pending);
  end if;

  -- Record the open wager. Mint the id in the DB when the caller didn't supply one
  -- (keeps core's `w_<n>` shape via wager_seq). The unique index on
  -- (account_id, idempotency_key) is the backstop: if two requests with the SAME key
  -- raced past the early-return above, the loser hits ON CONFLICT and we unwind its
  -- reservation so the stake is never held twice.
  v_id := coalesce(p_wager_id, 'w_' || nextval('wager_seq'));
  insert into wagers (id, account_id, stake, status, idempotency_key)
    values (v_id, p_account_id, p_stake, 'open', p_idempotency_key)
  on conflict (account_id, idempotency_key) where idempotency_key is not null
    do nothing
  returning * into w;

  if not found then
    -- A concurrent request won the unique-key race. Release the hold we just took and
    -- return that winning wager so this call is still an idempotent no-op.
    select * into w from wagers
      where account_id = p_account_id and idempotency_key = p_idempotency_key;
    insert into ledger (account_id, wager_id, kind, balance_delta, pending_delta, balance_after, pending_after)
      values (p_account_id, w.id, 'place', 0, 0, a.balance, a.pending - p_stake);
    update accounts set pending = recompute_pending(p_account_id), updated_at = now()
      where id = p_account_id returning * into a;
    return _money_envelope(a, w);
  end if;

  -- Ledger first: pending increases by the stake, balance unchanged (0015 invariant).
  -- balance_after/pending_after are recorded for the audit trail; pending is then
  -- DERIVED from the ledger so accounts.pending stays the cache, never the source.
  insert into ledger (account_id, wager_id, kind, balance_delta, pending_delta, balance_after, pending_after)
    values (p_account_id, w.id, 'place', 0, p_stake, a.balance, a.pending);
  update accounts set pending = recompute_pending(p_account_id), updated_at = now()
    where id = p_account_id returning * into a;

  return _money_envelope(a, w);
end;
$$;

-- ── grants: re-expose the new signature to authenticated clients only ────────────
revoke execute on function place_wager(text, bigint, text, text) from public;
grant  execute on function place_wager(text, bigint, text, text) to authenticated;
