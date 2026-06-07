/**
 * A versioned document on top of a `KVStore` (persistence/store). Most modules
 * don't want raw get/set — they want "load my state, or the default" and "save
 * my state", with a version stamp so an old shape on disk can be migrated or
 * safely discarded after a schema change. That's exactly what `persistedDoc`
 * gives, and it's how the app would persist the account, the bet tickets, or the
 * org tree without baking storage details into those modules.
 */

import type { KVStore } from './store.js'

export interface Doc<T> {
  readonly key: string
  /** Current value, or the configured initial if nothing valid is stored. */
  load(): T
  /** Persist a new value under the current version. */
  save(value: T): void
  /** Forget the stored value (next load returns the initial). */
  reset(): void
}

interface DocConfig<T> {
  /** Schema version. Bump it when `T`'s shape changes. */
  version: number
  /** Returned when nothing is stored (or a stale version can't be migrated). */
  initial: T
  /** Upgrade an older stored payload to the current shape. Omit to discard. */
  migrate?: (data: unknown, fromVersion: number) => T
}

interface Envelope<T> {
  v: number
  data: T
}

/** Wrap a store key as a typed, versioned document. */
export function persistedDoc<T>(store: KVStore, key: string, config: DocConfig<T>): Doc<T> {
  return {
    key,
    load(): T {
      const env = store.get<Envelope<T>>(key)
      if (!env || typeof env.v !== 'number') return config.initial
      if (env.v === config.version) return env.data
      // Stored under an older version: migrate if we can, else fall back fresh.
      return config.migrate ? config.migrate(env.data, env.v) : config.initial
    },
    save(value: T) {
      store.set<Envelope<T>>(key, { v: config.version, data: value })
    },
    reset() {
      store.remove(key)
    },
  }
}
