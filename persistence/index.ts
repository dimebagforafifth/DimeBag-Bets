/**
 * Persistence module public surface (CLAUDE.md §6). Import the storage seam and
 * the versioned-document helper from here. To back state with Supabase later,
 * add a `createSupabaseStore(): KVStore` here — nothing else changes.
 */

export type { KVStore, StorageLike } from './store.js'
export { createMemoryStore, createLocalStore } from './store.js'

export type { Doc } from './doc.js'
export { persistedDoc } from './doc.js'
