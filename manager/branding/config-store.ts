/**
 * The book-config store (factory + singleton). Holds the one white-label config,
 * persists it under the shared 'dimebag' namespace, and APPLIES it on load + on
 * every change — hydrating the money-display singleton and the runtime theme. The
 * factory takes an injected `apply` so it's testable without a DOM or globals; the
 * singleton wires the real applier.
 */

import { createLocalStore, persistedDoc } from '../../persistence/index.js'
import { setMoneyDisplay } from '../../games/shared/presentation.js'
import { DEFAULT_BOOK_CONFIG, normalizeBookConfig, type BookConfig } from './config.js'
import { applyBranding } from './theme.js'

export interface DocLike<T> {
  load(): T
  save(value: T): void
}

export interface BookConfigStore {
  config(): BookConfig
  /** Merge a partial change (money is deep-merged), persist, apply, notify. */
  update(patch: Partial<BookConfig>): void
  /** Restore all defaults. */
  reset(): void
  subscribe(listener: () => void): () => void
  version(): number
}

export function createBookConfigStore(doc: DocLike<BookConfig>, apply: (cfg: BookConfig) => void): BookConfigStore {
  let cfg = normalizeBookConfig(doc.load())
  const listeners = new Set<() => void>()
  let version = 0

  apply(cfg) // hydrate the live document/singletons from the persisted config

  function commit(next: BookConfig): void {
    cfg = next
    doc.save(cfg)
    apply(cfg)
    version += 1
    for (const l of listeners) l()
  }

  return {
    config: () => cfg,
    update(patch) {
      commit(normalizeBookConfig({ ...cfg, ...patch, money: { ...cfg.money, ...(patch.money ?? {}) } }))
    },
    reset() {
      commit(normalizeBookConfig({ ...DEFAULT_BOOK_CONFIG, money: { ...DEFAULT_BOOK_CONFIG.money } }))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    version: () => version,
  }
}

/** The live applier: hydrate the money-display singleton + the runtime theme. */
function applyConfig(cfg: BookConfig): void {
  setMoneyDisplay(cfg.money)
  applyBranding(cfg)
}

const kv = createLocalStore({ namespace: 'dimebag' })
const doc = persistedDoc<BookConfig>(kv, 'manager.book-config', { version: 1, initial: DEFAULT_BOOK_CONFIG })

/** The live, persisted book-config store (applies branding + presentation on load). */
export const bookConfigStore = createBookConfigStore(doc, applyConfig)
