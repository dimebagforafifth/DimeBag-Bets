# Note — Migration 0016: atomic + idempotent `place_wager` (G1)

Implements gap-analysis §1.1 / pending-issues item 3. Not yet applied to any remote.

## What changed
- New column `wagers.idempotency_key text` + partial unique index
  `wagers_account_idempotency_key` on `(account_id, idempotency_key)` where the key
  is non-null. Client mints one UUID per placement attempt.
- `place_wager` redefined (now `place_wager(account, stake, wager_id?, idempotency_key?)`):
  - **Atomic acceptance** — the affordability check and the `pending` reserve are a
    single `UPDATE accounts SET pending = pending + p_stake WHERE id = ? AND
    (credit_limit + balance - pending) >= p_stake RETURNING ...`. 0 rows = rejected.
    No read-then-write window (the old version used `SELECT ... FOR UPDATE` then a
    separate check + update).
  - **Idempotent** — a repeated key short-circuits to a no-op that returns the
    already-created wager; a same-key race that slips past the early return is caught
    by the unique index (`ON CONFLICT DO NOTHING`) and the loser's hold is released.
- Wager id is minted in the DB (`wager_seq`, keeping core's `w_<n>` shape) when the
  caller doesn't supply one.

## Invariants preserved
Ledger-derived balance/pending (0015): ledger row written first, then
`accounts.pending = recompute_pending(...)`. `accounts.pending` stays a cache;
`reconcile_balance()` still repairs drift.

## Follow-ups for callers (out of scope for this migration)
- `money/rpc.ts` / `persistence/supabase/*` must pass the new `idempotency_key` arg
  (client-minted UUID per placement) to get replay protection.
- `persistence/supabase/fake-server.ts` should mirror this idempotency behavior to
  keep the test double in sync with the production RPC.
