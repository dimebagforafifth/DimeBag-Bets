/**
 * The async transport the Supabase `KVStore` writes through (CLAUDE.md §6).
 *
 * The persistence seam (`KVStore`) is *synchronous* — every module reads/writes the
 * figure, tickets and the org tree without awaiting. Supabase is *async*. We bridge
 * the two with a write-through cache (see `supabase-store.ts`): reads/writes hit an
 * in-memory snapshot synchronously, and every mutation is mirrored to this transport
 * in the background. This file is just the transport contract plus a REST (PostgREST)
 * implementation; the cache lives next door.
 *
 * Documents are stored one row per (owner, namespace, key) in the `kv_documents`
 * table. The row `value` is the JSON envelope `persistedDoc` already produces, so the
 * server is a dumb bytes store for documents — the *money* path is the one that's
 * server-authoritative (see `../money/`), never these blobs.
 */

import { type SupabaseEnv } from './env.js'

/** A single stored document row (namespace-scoped key → JSON value). */
export interface KvRow {
  key: string
  value: unknown
}

/**
 * The async storage contract the Supabase `KVStore` mirrors to. Kept tiny and
 * swappable: the REST implementation below is one; tests inject a fake server.
 */
export interface SupabaseKvTransport {
  /** Load every document in this namespace (the owner is implied by the auth token + RLS). */
  loadAll(): Promise<KvRow[]>
  /** Create or replace one document. */
  upsert(key: string, value: unknown): Promise<void>
  /** Delete one document. */
  remove(key: string): Promise<void>
}

/** Minimal `fetch` shape we depend on, so a fake can be injected in tests. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
}>

export interface RestKvTransportOpts {
  env: SupabaseEnv
  /** The document namespace (e.g. `'dimebag'`) — scopes every row. */
  namespace: string
  /** The signed-in user's access token (JWT). Falls back to the anon key (RLS still applies). */
  accessToken?: string
  /** Injectable fetch (defaults to global `fetch`) — the seam tests swap out. */
  fetchImpl?: FetchLike
}

/**
 * A PostgREST-backed transport against the `kv_documents` table.
 *
 * TODO(api): this issues real HTTP calls against a live Supabase project. It is only
 * ever constructed when `SUPABASE_URL` / `SUPABASE_ANON_KEY` are present (see
 * `createStore`), so with no keys nothing here runs and the app stays on localStorage.
 * Verify request/response shapes against the real project once keys are dropped in;
 * the table + RLS it targets are defined in `supabase/migrations/`.
 */
export function createRestKvTransport(opts: RestKvTransportOpts): SupabaseKvTransport {
  const { env, namespace } = opts
  const fetchImpl = (opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike))
  const base = `${env.url}/rest/v1/kv_documents`
  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
    apikey: env.anonKey,
    Authorization: `Bearer ${opts.accessToken ?? env.anonKey}`,
    'Content-Type': 'application/json',
    ...extra,
  })
  const enc = encodeURIComponent

  return {
    async loadAll(): Promise<KvRow[]> {
      const url = `${base}?select=key,value&namespace=eq.${enc(namespace)}`
      const res = await fetchImpl(url, { headers: headers() })
      if (!res.ok) throw new Error(`kv loadAll failed (${res.status})`)
      const rows = (await res.json()) as Array<{ key: string; value: unknown }>
      return rows.map((r) => ({ key: r.key, value: r.value }))
    },

    async upsert(key: string, value: unknown): Promise<void> {
      // `resolution=merge-duplicates` makes this an upsert on the (owner,namespace,key) PK.
      const res = await fetchImpl(base, {
        method: 'POST',
        headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ namespace, key, value }),
      })
      if (!res.ok) throw new Error(`kv upsert failed (${res.status})`)
    },

    async remove(key: string): Promise<void> {
      const url = `${base}?namespace=eq.${enc(namespace)}&key=eq.${enc(key)}`
      const res = await fetchImpl(url, { method: 'DELETE', headers: headers() })
      if (!res.ok) throw new Error(`kv remove failed (${res.status})`)
    },
  }
}
