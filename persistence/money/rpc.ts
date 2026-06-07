/**
 * The RPC wire contract for the server-authoritative money path — the single place
 * the Supabase client (`supabase-service.ts`) and the test double (`fake-server.ts`)
 * agree on function names, params and row shapes, so they can't drift. The Postgres
 * functions these map to live in `supabase/migrations/`.
 *
 * Rows are snake_case (Postgres convention); core's `Account` / `Wager` are camelCase.
 * The mappers here are the only translation point.
 */

import type { Account, Outcome, Wager, WagerStatus } from '../../core/index.js'

/** The SECURITY DEFINER RPC names, mirrored 1:1 by the SQL migration. */
export const RPC = {
  place: 'place_wager',
  resolve: 'resolve_wager',
  resolveAt: 'resolve_at_multiplier',
  grant: 'grant_bonus',
  adjust: 'adjust_balance',
  settle: 'settle_week',
} as const

/** The `accounts` table row shape (money columns are bigint cents). */
export interface AccountRow {
  id: string
  credit_limit: number
  balance: number
  pending: number
  max_wager: number | null
  min_wager: number | null
  max_payout: number | null
  betting_locked: boolean
}

/** The `wagers` table row shape. */
export interface WagerRow {
  id: string
  account_id: string
  stake: number
  status: WagerStatus
  outcome: Outcome | null
  payout_multiplier: number | null
}

/** Account row → core `Account`. Null optionals are dropped (not set to undefined keys). */
export function rowToAccount(r: AccountRow): Account {
  const a: Account = {
    id: r.id,
    creditLimit: r.credit_limit,
    balance: r.balance,
    pending: r.pending,
  }
  if (r.max_wager != null) a.maxWager = r.max_wager
  if (r.min_wager != null) a.minWager = r.min_wager
  if (r.max_payout != null) a.maxPayout = r.max_payout
  if (r.betting_locked) a.bettingLocked = true
  return a
}

/** Core `Account` → account row (the server's storage shape). */
export function accountToRow(a: Account): AccountRow {
  return {
    id: a.id,
    credit_limit: a.creditLimit,
    balance: a.balance,
    pending: a.pending,
    max_wager: a.maxWager ?? null,
    min_wager: a.minWager ?? null,
    max_payout: a.maxPayout ?? null,
    betting_locked: a.bettingLocked ?? false,
  }
}

/** Wager row → core `Wager`. */
export function rowToWager(r: WagerRow): Wager {
  const w: Wager = { id: r.id, accountId: r.account_id, stake: r.stake, status: r.status }
  if (r.outcome != null) w.outcome = r.outcome
  if (r.payout_multiplier != null) w.payoutMultiplier = r.payout_multiplier
  return w
}

/** Core `Wager` → wager row. */
export function wagerToRow(w: Wager): WagerRow {
  return {
    id: w.id,
    account_id: w.accountId,
    stake: w.stake,
    status: w.status,
    outcome: w.outcome ?? null,
    payout_multiplier: w.payoutMultiplier ?? null,
  }
}

/** The `{ account, wager? }` envelope every money RPC returns. */
export interface RpcEnvelope {
  account: AccountRow
  wager?: WagerRow
}
