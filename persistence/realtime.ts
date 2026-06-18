/**
 * Supabase Realtime — live push for the data layer (CLAUDE.md §6). The read side of the
 * odds cache (app/book/odds-source.ts) currently interval-polls Postgres; this swaps that
 * for `postgres_changes` pushes when a project is provisioned. `0005_odds_cache.sql` already
 * adds the three cache tables to the `supabase_realtime` publication — this is the client
 * half that subscribes to it.
 *
 * Env-gated like everything else in this module: with NO keys `subscribeToChanges` is a
 * no-op disposer and `realtimeSchedule` returns `null`, so the caller keeps its interval /
 * the built-in mock slate — the byte-for-byte-identical-without-keys invariant holds.
 *
 * `@supabase/supabase-js` is LAZY-imported (dynamic `import()`), so it only enters the
 * bundle / process when realtime actually runs (i.e. when keys are present). The client
 * factory is injectable so tests never touch the network or the real package.
 */

import { getSupabaseEnv, type EnvSource, type SupabaseEnv } from './supabase/env.js'

/** The slice of a Supabase realtime channel we depend on (so a fake can stand in). */
export interface RealtimeChannelLike {
  on(
    event: 'postgres_changes',
    filter: { event: string; schema: string; table: string },
    callback: () => void,
  ): RealtimeChannelLike
  subscribe(callback?: (status: string) => void): RealtimeChannelLike
  unsubscribe(): unknown
}

/** The slice of a Supabase client we depend on. */
export interface RealtimeClientLike {
  channel(name: string): RealtimeChannelLike
}

/** `createClient` shape — the real one from `@supabase/supabase-js`, or a test fake. */
export type CreateClientLike = (url: string, key: string, opts?: unknown) => RealtimeClientLike

/** The odds cache trio the poller fills and the book reads (0005_odds_cache.sql). */
export const ODDS_CACHE_TABLES = ['odds_events', 'odds_markets', 'odds_selections'] as const

export interface RealtimeOptions {
  /** Resolved env (tests). Default: the ambient SUPABASE_* keys. */
  env?: SupabaseEnv | null
  /** Injectable env source (tests); default reads the ambient keys. */
  envSource?: EnvSource
  /** Tables to watch for changes (default: the odds cache trio). */
  tables?: readonly string[]
  /** Channel name (default `'odds-cache'`). */
  channelName?: string
  /** Injectable client factory (tests). Default: lazy `@supabase/supabase-js` createClient. */
  createClient?: CreateClientLike
}

/** Lazy-load the real createClient — kept out of the bundle until realtime runs. */
async function loadCreateClient(): Promise<CreateClientLike> {
  const mod = (await import('@supabase/supabase-js')) as unknown as { createClient: CreateClientLike }
  return mod.createClient
}

/**
 * Subscribe to Supabase realtime `postgres_changes` on `tables`, invoking `onChange` once
 * the channel is SUBSCRIBED (the initial hydrate) and on every insert/update/delete.
 *
 * Env-gated: with no keys it returns a no-op disposer and never constructs a client, so the
 * caller's interval / mock fallback stays in force. Returns a disposer that tears the
 * channel down. Any failure to connect is swallowed — realtime is best-effort, the caller
 * already has a fallback.
 */
export function subscribeToChanges(onChange: () => void, opts: RealtimeOptions = {}): () => void {
  const env = opts.env ?? getSupabaseEnv(opts.envSource)
  if (!env) return () => {} // no keys → no realtime; caller keeps polling / mock

  const tables = opts.tables ?? ODDS_CACHE_TABLES
  const channelName = opts.channelName ?? 'odds-cache'
  let channel: RealtimeChannelLike | null = null
  let disposed = false

  void (async () => {
    try {
      const createClient = opts.createClient ?? (await loadCreateClient())
      if (disposed) return
      const client = createClient(env.url, env.anonKey, { auth: { persistSession: false } })
      let ch = client.channel(channelName)
      for (const table of tables) {
        // Guard on `disposed` so a late event during/after teardown can't fire onChange.
        ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          if (!disposed) onChange()
        })
      }
      channel = ch.subscribe((status) => {
        if (!disposed && status === 'SUBSCRIBED') onChange() // initial hydrate once we're live
      })
    } catch {
      /* realtime unavailable — the caller's interval/mock fallback stands */
    }
  })()

  return () => {
    disposed = true
    try {
      channel?.unsubscribe()
    } catch {
      /* already gone */
    }
  }
}

/**
 * A `schedule`-shaped adapter for `connectOddsCache` (app/book/odds-source.ts). When keys
 * are present it drives the slate refresh from realtime pushes (the polling interval is
 * ignored — the `tick` fires on every cache change instead). With NO keys it returns
 * `null`, so the caller falls back to interval polling exactly as before.
 *
 * Wire it as the default scheduler:
 *   const schedule = opts.schedule ?? realtimeSchedule({ envSource }) ?? intervalSchedule
 */
export function realtimeSchedule(
  opts: RealtimeOptions = {},
): ((tick: () => void, intervalMs: number) => () => void) | null {
  const env = opts.env ?? getSupabaseEnv(opts.envSource)
  if (!env) return null
  return (tick) => subscribeToChanges(tick, { ...opts, env })
}
