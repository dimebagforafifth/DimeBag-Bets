/**
 * The env-aware store selector (CLAUDE.md §6). ONE function the app calls to get a
 * `KVStore`: it returns the Supabase-backed adapter when `SUPABASE_URL` /
 * `SUPABASE_ANON_KEY` are set, and the localStorage adapter otherwise.
 *
 * Adoption is a one-line swap per store — `createLocalStore({ namespace: 'dimebag' })`
 * → `createStore({ namespace: 'dimebag' })`. It is safe to adopt *before* any keys
 * exist: with no keys this is byte-for-byte the current localStorage behaviour, so
 * nothing changes until the operator drops the keys in. (The app shell owns those
 * call sites; this layer only provides the selector — see persistence/README.md.)
 */

import type { KVStore } from './store.js'
import { createLocalStore } from './store.js'
import { createSupabaseStore } from './supabase-store.js'
import { createRestKvTransport, type FetchLike } from './supabase/kv-transport.js'
import { getSupabaseEnv, type EnvSource } from './supabase/env.js'
import { tenantNamespace } from './tenant.js'

export interface CreateStoreOpts {
  /** Document namespace — scopes keys in every backend (default `'dimebag'`). */
  namespace?: string
  /** Signed-in user's access token, forwarded to the Supabase transport (RLS). */
  accessToken?: string
  /** Injectable fetch for the Supabase transport (tests); defaults to global fetch. */
  fetchImpl?: FetchLike
  /** Injectable env (tests); defaults to the ambient process.env / import.meta.env. */
  envSource?: EnvSource
}

/**
 * Get the right `KVStore` for the current environment. Always returns synchronously
 * and is usable immediately (the Supabase variant is local-first: seeded from
 * localStorage, then reconciled with the server in the background).
 */
export function createStore(opts: CreateStoreOpts = {}): KVStore {
  const base = opts.namespace ?? 'dimebag'
  const env = getSupabaseEnv(opts.envSource)
  if (!env) {
    // createLocalStore resolves the active tenant itself (default → unchanged).
    return createLocalStore({ namespace: base })
  }
  // Keys present → Supabase, with localStorage as the offline fallback/cache. The
  // fallback resolves the tenant internally; the transport must use the SAME resolved
  // namespace so both halves of the cache target one tenant's keyspace.
  const fallback = createLocalStore({ namespace: base })
  const transport = createRestKvTransport({
    env,
    namespace: tenantNamespace(base),
    accessToken: opts.accessToken,
    fetchImpl: opts.fetchImpl,
  })
  return createSupabaseStore({ transport, fallback })
}
