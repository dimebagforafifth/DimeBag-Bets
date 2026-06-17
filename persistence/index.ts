/**
 * Persistence module public surface (CLAUDE.md §6). Import the storage seam and
 * the versioned-document helper from here.
 *
 * The Supabase backend lives behind the SAME `KVStore` interface: call
 * `createStore({ namespace })` instead of `createLocalStore(...)` and you get the
 * Supabase-backed adapter when `SUPABASE_URL` / `SUPABASE_ANON_KEY` are set, and
 * localStorage otherwise — nothing upstream changes. The server-authoritative money
 * path (place/grade/adjust/settle/grant via RPC + RLS) is `./money/`.
 */

export type { KVStore, StorageLike } from './store.js'
export { createMemoryStore, createLocalStore } from './store.js'

export type { Doc } from './doc.js'
export { persistedDoc } from './doc.js'

// Multi-tenant context: scopes every store's namespace to the active book (CLAUDE.md
// §5). Default tenant === today's exact behaviour; a real tenant gets its own keyspace.
export {
  DEFAULT_TENANT,
  getActiveTenant,
  hasTenant,
  setActiveTenant,
  subscribeTenant,
  tenantNamespace,
  __resetTenant,
} from './tenant.js'

// Supabase backend (off until env keys are present; falls back to localStorage).
export { createStore, type CreateStoreOpts } from './select.js'
export { createSupabaseStore, type SupabaseStore, type SupabaseStoreOpts } from './supabase-store.js'
export {
  getSupabaseEnv,
  isSupabaseConfigured,
  type SupabaseEnv,
  type EnvSource,
} from './supabase/env.js'
export {
  createRestKvTransport,
  type SupabaseKvTransport,
  type KvRow,
  type FetchLike,
} from './supabase/kv-transport.js'

// Realtime push (off until env keys are present; falls back to interval polling / mock).
export {
  subscribeToChanges,
  realtimeSchedule,
  ODDS_CACHE_TABLES,
  type RealtimeOptions,
  type RealtimeChannelLike,
  type RealtimeClientLike,
  type CreateClientLike,
} from './realtime.js'

// Scheduled-promos cron worker (mock-safe; the backend backstop for the in-app runner).
export {
  runScheduledPromosCron,
  type PromoCronResult,
  type PromoCronOptions,
  type ScheduleSource,
} from './promo-cron.js'

// Server-authoritative money path (RPC + RLS; off until env keys are present).
export {
  createMoneyService,
  createLocalMoneyService,
  createSupabaseMoneyService,
  type MoneyService,
  type MoneyServiceResult,
  type PlacedResult,
  type AccountSource,
} from './money/index.js'
