/**
 * The SERVER-AUTHORITATIVE money service. Every mutation is a call to a SECURITY
 * DEFINER Postgres function (an RPC); the function recomputes the result from the
 * stored row and writes it. The browser only ever *asks* — it never sends a balance,
 * and RLS forbids it from writing the money columns directly (see
 * `supabase/migrations/`). So a tampered client cannot fabricate or overwrite a figure.
 *
 * The math the RPC runs mirrors `core` exactly (the SQL is the canonical server copy;
 * the in-TS `fake-server` used by tests runs `core` itself to prove the contract).
 * The provably-fair RNG is untouched — this validates the ledger write, not the dice.
 */

import type { Account } from '../../core/index.js'
import type { SupabaseEnv } from '../supabase/env.js'
import type { FetchLike } from '../supabase/kv-transport.js'
import type { MoneyService, MoneyServiceResult, PlacedResult } from './types.js'
import {
  RPC,
  rowToAccount,
  rowToWager,
  type AccountRow,
  type RpcEnvelope,
} from './rpc.js'

export interface SupabaseMoneyServiceOpts {
  env: SupabaseEnv
  /** Signed-in user's access token (JWT); falls back to the anon key (RLS still applies). */
  accessToken?: string
  /** Injectable fetch (defaults to global `fetch`) — the seam tests swap for a fake server. */
  fetchImpl?: FetchLike
}

/**
 * Build the Supabase-backed money service.
 *
 * TODO(api): the calls below hit a live Supabase project's `/rest/v1/rpc/*` endpoints.
 * This service is only constructed when keys are present (see `createMoneyService`),
 * so with no keys nothing here runs. Verify the RPC param/return shapes against the
 * real functions in `supabase/migrations/` once the project + keys are dropped in.
 */
export function createSupabaseMoneyService(opts: SupabaseMoneyServiceOpts): MoneyService {
  const { env } = opts
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const headers = (): Record<string, string> => ({
    apikey: env.anonKey,
    Authorization: `Bearer ${opts.accessToken ?? env.anonKey}`,
    'Content-Type': 'application/json',
  })

  /** POST to an RPC, surfacing the server's error message so core's rules read through. */
  async function rpc(fn: string, params: Record<string, unknown>): Promise<RpcEnvelope> {
    const res = await fetchImpl(`${env.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      // PostgREST returns the RAISE'd message as { message }; surface it so callers
      // see the same text core throws ("stake exceeds the max bet", etc.).
      let msg = `rpc ${fn} failed (${res.status})`
      try {
        const body = (await res.json()) as { message?: string }
        if (body?.message) msg = body.message
      } catch {
        /* non-JSON error body — keep the status message */
      }
      throw new Error(msg)
    }
    return (await res.json()) as RpcEnvelope
  }

  function placed(env_: RpcEnvelope): PlacedResult {
    if (!env_.wager) throw new Error('rpc did not return a wager')
    return { account: rowToAccount(env_.account), wager: rowToWager(env_.wager) }
  }
  function result(env_: RpcEnvelope): MoneyServiceResult {
    return { account: rowToAccount(env_.account) }
  }

  return {
    async getAccount(id: string): Promise<Account | null> {
      const url = `${env.url}/rest/v1/accounts?id=eq.${encodeURIComponent(id)}&select=*`
      const res = await fetchImpl(url, { headers: headers() })
      if (!res.ok) throw new Error(`getAccount failed (${res.status})`)
      const rows = (await res.json()) as AccountRow[]
      return rows.length ? rowToAccount(rows[0]) : null
    },

    place: (accountId, stake, placeOpts) =>
      rpc(RPC.place, {
        p_account_id: accountId,
        p_stake: stake,
        p_wager_id: placeOpts?.wagerId ?? null,
      }).then(placed),

    resolve: (accountId, wagerId, outcome, payoutMultiplier) =>
      rpc(RPC.resolve, {
        p_account_id: accountId,
        p_wager_id: wagerId,
        p_outcome: outcome,
        p_multiplier: payoutMultiplier ?? null,
      }).then(placed),

    resolveAt: (accountId, wagerId, multiplier) =>
      rpc(RPC.resolveAt, {
        p_account_id: accountId,
        p_wager_id: wagerId,
        p_multiplier: multiplier,
      }).then(placed),

    grant: (accountId, cents, meta) =>
      rpc(RPC.grant, { p_account_id: accountId, p_cents: cents, p_meta: meta ?? null }).then(result),

    adjust: (accountId, delta, meta) =>
      rpc(RPC.adjust, { p_account_id: accountId, p_delta: delta, p_meta: meta ?? null }).then(result),

    settle: (accountId) => rpc(RPC.settle, { p_account_id: accountId }).then(result),
  }
}
