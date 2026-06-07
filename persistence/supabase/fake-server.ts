/**
 * An in-TS stand-in for the Supabase backend, used by tests. It is the test double
 * the injectable `fetch` points at, and it MIRRORS the SQL in `supabase/migrations/`:
 *
 *   - PostgREST table endpoints for `kv_documents` and `accounts`.
 *   - **RLS**: a direct `PATCH /rest/v1/accounts` (a client trying to write its own
 *     balance) is REJECTED (403) — there is no client UPDATE grant on the money
 *     columns. The only way the figure moves is through an RPC.
 *   - **SECURITY DEFINER RPCs** (`place_wager`, `resolve_wager`, …) that recompute the
 *     result and write it. To stay honest, the RPC handlers run `core` itself, so the
 *     server math is the same money model the whole app shares (§3) — no second
 *     implementation to drift. The SQL functions are the production copy of this.
 *
 * TODO(integration): a real DB test should run the SQL in `supabase/migrations/`
 * against a local Postgres (supabase start / pgTAP) and assert the same guarantees.
 * This double proves the contract the client depends on; the SQL proves the server.
 */

import {
  grant as coreGrant,
  placeWager,
  resolveAtMultiplier,
  resolveWager,
  settleWeek,
  adjustBalance,
  type Account,
  type Outcome,
  type Wager,
} from '../../core/index.js'
import { accountToRow, wagerToRow, type AccountRow, type RpcEnvelope } from '../money/rpc.js'
import type { FetchLike, KvRow } from './kv-transport.js'

/** A recorded server-side ledger row (mirrors the `ledger` table). */
export interface FakeLedgerRow {
  kind: 'place' | 'resolve' | 'settle' | 'grant' | 'adjust'
  account_id: string
  wager_id: string | null
  balance_after: number
  pending_after: number
}

/** A recorded settlement row (mirrors the `settlements` table). */
export interface FakeSettlementRow {
  account_id: string
  balance_before: number
}

export interface FakeServerOpts {
  /** Seed accounts the RPCs mutate (camelCase core `Account`s). */
  accounts?: Account[]
  /** The authenticated owner id (RLS scope) for kv + account reads. Default 'owner'. */
  owner?: string
}

export interface FakeSupabaseServer {
  /** The injectable fetch tests pass to the transport / money service. */
  fetch: FetchLike
  /** Authoritative account row, for assertions. */
  accountRow(id: string): AccountRow | undefined
  /** Server-side ledger, for assertions. */
  ledger(): FakeLedgerRow[]
  /** Server-side settlement rows, for assertions. */
  settlements(): FakeSettlementRow[]
  /** Raw kv rows in a namespace, for assertions. */
  kvRows(namespace: string): KvRow[]
}

interface JsonResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
}

function respond(status: number, body: unknown): JsonResponse {
  const text = JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (text === undefined ? null : JSON.parse(text)),
    text: async () => text ?? '',
  }
}

export function createFakeSupabaseServer(opts: FakeServerOpts = {}): FakeSupabaseServer {
  const accounts = new Map<string, Account>()
  for (const a of opts.accounts ?? []) accounts.set(a.id, { ...a })
  const wagers = new Map<string, Wager>()
  const ledger: FakeLedgerRow[] = []
  const settlements: FakeSettlementRow[] = []
  // kv: owner → namespace → key → value
  const kv = new Map<string, { namespace: string; key: string; value: unknown }>()
  const owner = opts.owner ?? 'owner'
  const kvKey = (ns: string, k: string) => `${ns}::${k}`

  function record(
    kind: FakeLedgerRow['kind'],
    a: Account,
    wagerId: string | null,
  ): void {
    ledger.push({
      kind,
      account_id: a.id,
      wager_id: wagerId,
      balance_after: a.balance,
      pending_after: a.pending,
    })
  }

  function loadAccount(id: string): Account {
    const a = accounts.get(id)
    if (!a) throw new Error(`unknown account ${id}`)
    return a // mutated in place, like a Postgres row updated in the function
  }

  /** Run a SECURITY DEFINER RPC. Errors become a 400 with { message } like PostgREST. */
  function runRpc(fn: string, p: Record<string, unknown>): JsonResponse {
    try {
      switch (fn) {
        case 'place_wager': {
          const a = loadAccount(p.p_account_id as string)
          const w = placeWager(a, p.p_stake as number, (p.p_wager_id as string) ?? undefined)
          wagers.set(w.id, w)
          record('place', a, w.id)
          return respond(200, envelope(a, w))
        }
        case 'resolve_wager': {
          const a = loadAccount(p.p_account_id as string)
          const w = wager(p.p_wager_id as string, a.id)
          resolveWager(a, w, p.p_outcome as Outcome, (p.p_multiplier as number) ?? undefined)
          record('resolve', a, w.id)
          return respond(200, envelope(a, w))
        }
        case 'resolve_at_multiplier': {
          const a = loadAccount(p.p_account_id as string)
          const w = wager(p.p_wager_id as string, a.id)
          resolveAtMultiplier(a, w, p.p_multiplier as number)
          record('resolve', a, w.id)
          return respond(200, envelope(a, w))
        }
        case 'grant_bonus': {
          const a = loadAccount(p.p_account_id as string)
          coreGrant(a, p.p_cents as number, (p.p_meta as Record<string, unknown>) ?? undefined)
          record('grant', a, null)
          return respond(200, envelope(a))
        }
        case 'adjust_balance': {
          const a = loadAccount(p.p_account_id as string)
          adjustBalance(a, p.p_delta as number)
          record('adjust', a, null)
          return respond(200, envelope(a))
        }
        case 'settle_week': {
          const a = loadAccount(p.p_account_id as string)
          settlements.push({ account_id: a.id, balance_before: a.balance })
          settleWeek(a)
          record('settle', a, null)
          return respond(200, envelope(a))
        }
        default:
          return respond(404, { message: `no function ${fn}` })
      }
    } catch (err) {
      return respond(400, { message: err instanceof Error ? err.message : String(err) })
    }
  }

  function wager(id: string, accountId: string): Wager {
    const w = wagers.get(id)
    if (!w) throw new Error(`unknown wager ${id}`)
    if (w.accountId !== accountId) {
      throw new Error(`wager ${id} does not belong to account ${accountId}`)
    }
    return w
  }

  function envelope(a: Account, w?: Wager): RpcEnvelope {
    const e: RpcEnvelope = { account: accountToRow(a) }
    if (w) e.wager = wagerToRow(w)
    return e
  }

  const fetchImpl: FetchLike = async (rawUrl, init) => {
    const url = new URL(rawUrl)
    const path = url.pathname
    const method = (init?.method ?? 'GET').toUpperCase()

    // ---- RPC: the only path allowed to move money ----
    if (path.startsWith('/rest/v1/rpc/')) {
      if (method !== 'POST') return respond(405, { message: 'rpc must be POST' })
      const fn = path.slice('/rest/v1/rpc/'.length)
      const params = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {}
      return runRpc(fn, params)
    }

    // ---- accounts table ----
    if (path === '/rest/v1/accounts') {
      if (method === 'GET') {
        const idEq = eqValue(url.searchParams.get('id'))
        const rows: AccountRow[] = []
        for (const a of accounts.values()) {
          if (idEq == null || a.id === idEq) rows.push(accountToRow(a))
        }
        return respond(200, rows)
      }
      // RLS: clients have no UPDATE/INSERT/DELETE grant on the money columns. Any
      // direct write to balance/pending/credit_limit is refused — the figure can
      // only move through a SECURITY DEFINER RPC. THIS is the guarantee tested.
      if (method === 'PATCH' || method === 'PUT' || method === 'POST' || method === 'DELETE') {
        return respond(403, {
          message: 'new row violates row-level security policy for table "accounts"',
        })
      }
    }

    // ---- kv_documents table (opaque document blobs, owner-scoped) ----
    if (path === '/rest/v1/kv_documents') {
      if (method === 'GET') {
        const ns = eqValue(url.searchParams.get('namespace'))
        const rows: KvRow[] = []
        for (const r of kv.values()) {
          if (ns == null || r.namespace === ns) rows.push({ key: r.key, value: r.value })
        }
        return respond(200, rows)
      }
      if (method === 'POST') {
        const body = init?.body ? JSON.parse(init.body as string) : {}
        const items = Array.isArray(body) ? body : [body]
        for (const it of items as Array<{ namespace: string; key: string; value: unknown }>) {
          kv.set(kvKey(it.namespace, it.key), { namespace: it.namespace, key: it.key, value: it.value })
        }
        return respond(201, null)
      }
      if (method === 'DELETE') {
        const ns = eqValue(url.searchParams.get('namespace'))
        const k = eqValue(url.searchParams.get('key'))
        for (const [mapKey, r] of [...kv.entries()]) {
          if ((ns == null || r.namespace === ns) && (k == null || r.key === k)) kv.delete(mapKey)
        }
        return respond(204, null)
      }
    }

    return respond(404, { message: `no route ${method} ${path}` })
  }

  /** PostgREST filters look like `eq.<value>`; pull the value out (or null if absent). */
  function eqValue(raw: string | null): string | null {
    if (raw == null) return null
    return raw.startsWith('eq.') ? decodeURIComponent(raw.slice(3)) : decodeURIComponent(raw)
  }

  return {
    fetch: fetchImpl,
    accountRow: (id) => {
      const a = accounts.get(id)
      return a ? accountToRow(a) : undefined
    },
    ledger: () => [...ledger],
    settlements: () => [...settlements],
    kvRows: (namespace) => {
      void owner // owner scoping is single-tenant in the double; kept for parity
      const rows: KvRow[] = []
      for (const r of kv.values()) if (r.namespace === namespace) rows.push({ key: r.key, value: r.value })
      return rows
    },
  }
}
