/**
 * Persistence — a tiny, swappable key/value storage seam (CLAUDE.md §6, the
 * integration boundary). It exists so any module's state (the figure, open
 * tickets, the org tree) can be saved and loaded WITHOUT that module knowing or
 * caring where the bytes live. Today: in-memory (tests/SSR) and `localStorage`
 * (the browser). Tomorrow: a Supabase-backed `KVStore` — implement this one
 * interface and nothing upstream changes. This file holds no app state itself.
 *
 * Values are treated as JSON documents (serialized on write, parsed on read), so
 * every adapter has the same value semantics — a stored object is a snapshot,
 * not a live reference. That keeps the memory adapter honest with localStorage.
 */

/** The one storage contract every adapter implements. */
export interface KVStore {
  /** Read a value, or null if absent / unreadable. */
  get<T>(key: string): T | null
  /** Write a value (overwrites). */
  set<T>(key: string, value: T): void
  /** Delete a key. */
  remove(key: string): void
  /** All keys currently held (namespace-stripped). */
  keys(): string[]
  /** Drop everything in this store / namespace. */
  clear(): void
}

/** JSON round-trip so stored values are snapshots, never live references. */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)
}

/** In-memory store — the default for tests and any non-browser context.
 *  `set(key, undefined)` means "absent" (it removes the key), so reads return
 *  null uniformly with the localStorage adapter — never a stray `undefined`. */
export function createMemoryStore(): KVStore {
  const map = new Map<string, unknown>()
  return {
    get: <T>(key: string): T | null => {
      const v = map.get(key)
      return v === undefined ? null : (clone(v) as T)
    },
    set: <T>(key: string, value: T) => {
      if (value === undefined) map.delete(key)
      else map.set(key, clone(value))
    },
    remove: (key: string) => void map.delete(key),
    keys: () => [...map.keys()],
    clear: () => map.clear(),
  }
}

/** Narrow of the Web Storage API we use — so a fake can be injected in tests. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  readonly length: number
  key(index: number): string | null
}

/** The real `localStorage` if it's available and usable, else null (SSR/denied). */
function realLocalStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const probe = '__dimebag_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return null
  }
}

/**
 * A `localStorage`-backed store. Keys are namespaced (`<namespace>:<key>`) so
 * several stores can share one localStorage without collision, and `keys()` /
 * `clear()` only ever touch THIS namespace — never foreign or other-app entries.
 * The namespace is always non-empty (an empty/missing one defaults to `dimebag`)
 * so an unscoped store can't wipe the whole origin. If storage is unavailable
 * (SSR, private mode, quota), it transparently degrades to memory — callers
 * never have to guard.
 */
export function createLocalStore(opts: { namespace?: string; backing?: StorageLike } = {}): KVStore {
  const backing = opts.backing ?? realLocalStorage()
  if (!backing) return createMemoryStore()

  // Never an empty prefix — that would make keys()/clear() match the whole origin.
  const namespace = opts.namespace && opts.namespace.length > 0 ? opts.namespace : 'dimebag'
  const prefix = `${namespace}:`
  const full = (key: string) => `${prefix}${key}`

  // Shared by keys()/clear() so neither depends on `this` (safe to destructure).
  const ownKeys = (): string[] => {
    const out: string[] = []
    for (let i = 0; i < backing.length; i++) {
      const k = backing.key(i)
      if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length))
    }
    return out
  }

  return {
    get<T>(key: string): T | null {
      const raw = backing.getItem(full(key))
      if (raw == null) return null
      try {
        return JSON.parse(raw) as T
      } catch {
        return null // corrupt entry → treat as absent rather than throw
      }
    },
    set<T>(key: string, value: T) {
      if (value === undefined) {
        backing.removeItem(full(key)) // "set undefined" === absent, like the memory adapter
        return
      }
      try {
        backing.setItem(full(key), JSON.stringify(value))
      } catch {
        /* over quota / denied — drop silently, callers keep their in-memory copy */
      }
    },
    remove: (key: string) => backing.removeItem(full(key)),
    keys: ownKeys,
    clear() {
      for (const k of ownKeys()) backing.removeItem(full(k))
    },
  }
}
