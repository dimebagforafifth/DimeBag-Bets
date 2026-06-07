/**
 * A Supabase-backed `KVStore` (CLAUDE.md §6) — the "tomorrow" adapter the seam was
 * built for. It satisfies the SAME synchronous `KVStore` interface as the memory and
 * localStorage adapters, so NOTHING upstream changes when it's switched on.
 *
 * The trick: the seam is synchronous but Supabase is async, so this is a
 * **write-through cache**.
 *   - Reads/writes hit an in-memory snapshot synchronously (identical semantics to
 *     `createMemoryStore`, including `set(undefined)` === absent).
 *   - Every mutation is ALSO mirrored, in the background, to (a) an optional
 *     localStorage `fallback` (so the tab keeps working offline / before sync) and
 *     (b) the async `transport` (the server). Transport failures are swallowed and
 *     counted — never thrown at the synchronous caller — exactly as localStorage
 *     silently drops an over-quota write.
 *   - `hydrate()` pulls the server's documents into the cache once on boot, then
 *     pushes up any local-only keys (first-run migration). `ready` resolves when
 *     that first reconciliation completes.
 *
 * This file holds NO money authority: documents are opaque blobs here. The
 * server-authoritative money path is `./money/` (RPC + RLS), kept separate on purpose.
 */

import type { KVStore } from './store.js'
import type { SupabaseKvTransport } from './supabase/kv-transport.js'

/** JSON round-trip so stored values are snapshots, never live references. */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)
}

/** A Supabase store also exposes its sync lifecycle on top of the `KVStore` contract. */
export interface SupabaseStore extends KVStore {
  /** Resolves after the first `hydrate()` (server → cache reconciliation) completes. */
  readonly ready: Promise<void>
  /** Pull server documents into the cache and push up any local-only keys. Idempotent. */
  hydrate(): Promise<void>
  /** Await all queued background writes (server + fallback). */
  flush(): Promise<void>
  /** Count of background writes that failed (and were absorbed by the fallback). */
  failedWrites(): number
}

export interface SupabaseStoreOpts {
  transport: SupabaseKvTransport
  /** A synchronous local store (usually localStorage) seeded into the cache on
   *  construct and written through on every mutation — the offline safety net. */
  fallback?: KVStore
  /** Begin `hydrate()` immediately on construct (default true). */
  autoHydrate?: boolean
}

/**
 * Build a Supabase-backed `KVStore`. Local-first: it returns immediately with the
 * fallback's data already in the cache, then reconciles with the server in the
 * background. Callers can `await store.ready` if they want the server snapshot first.
 */
export function createSupabaseStore(opts: SupabaseStoreOpts): SupabaseStore {
  const { transport, fallback } = opts
  const cache = new Map<string, unknown>()

  // Seed synchronously from the fallback so reads work on the very first tick,
  // before any network round-trip — the app never blocks on Supabase.
  if (fallback) {
    for (const k of fallback.keys()) {
      const v = fallback.get(k)
      if (v !== null) cache.set(k, v)
    }
  }

  // Background-write queue: chain promises so `flush()` can await the tail, and
  // never let a rejection escape to the synchronous caller.
  let tail: Promise<void> = Promise.resolve()
  let failed = 0
  function enqueue(op: () => Promise<void>): void {
    tail = tail.then(op).catch(() => {
      failed += 1 // absorbed: the fallback already has the value, app keeps working
    })
  }

  function syncRead<T>(key: string): T | null {
    const v = cache.get(key)
    return v === undefined ? null : (clone(v) as T)
  }

  function syncWrite<T>(key: string, value: T): void {
    if (value === undefined) {
      cache.delete(key)
      fallback?.set(key, undefined)
      enqueue(() => transport.remove(key))
      return
    }
    cache.set(key, clone(value))
    fallback?.set(key, value)
    enqueue(() => transport.upsert(key, value))
  }

  let resolveReady!: () => void
  const ready = new Promise<void>((r) => {
    resolveReady = r
  })
  let hydrated = false

  async function hydrate(): Promise<void> {
    try {
      const rows = await transport.loadAll()
      const serverKeys = new Set<string>()
      for (const { key, value } of rows) {
        serverKeys.add(key)
        cache.set(key, value)
        fallback?.set(key, value) // keep the offline copy aligned with the server
      }
      // First-run migration: any key we have locally but the server doesn't gets
      // pushed up, so an existing localStorage book lands in Supabase on first sync.
      for (const key of [...cache.keys()]) {
        if (!serverKeys.has(key)) enqueue(() => transport.upsert(key, cache.get(key)))
      }
    } finally {
      if (!hydrated) {
        hydrated = true
        resolveReady()
      }
    }
  }

  if (opts.autoHydrate !== false) void hydrate()

  return {
    get: <T>(key: string): T | null => syncRead<T>(key),
    set: <T>(key: string, value: T): void => syncWrite<T>(key, value),
    remove: (key: string): void => {
      cache.delete(key)
      fallback?.remove(key)
      enqueue(() => transport.remove(key))
    },
    keys: (): string[] => [...cache.keys()],
    clear: (): void => {
      const keys = [...cache.keys()]
      cache.clear()
      fallback?.clear()
      for (const k of keys) enqueue(() => transport.remove(k))
    },
    ready,
    hydrate,
    flush: () => tail,
    failedWrites: () => failed,
  }
}
