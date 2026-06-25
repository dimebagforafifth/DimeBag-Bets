/**
 * Shared Supabase client for the worker (service-role).
 *
 * The worker runs OUTSIDE the browser and OUTSIDE Vercel's request lifecycle, so it uses the
 * service-role key to write the odds cache (RLS blocks anon writes on those tables) and to
 * publish Crash round state over Realtime. The service-role key is server-only — it lives in
 * the worker host's env (Railway/Fly secret, or the VPS unit's EnvironmentFile), never in any
 * browser bundle.
 *
 * With NO Supabase env set, `getServiceClient()` returns null and the worker degrades exactly
 * like the rest of the app: the poller falls back to an in-memory counting cache and the Crash
 * clock logs ticks instead of broadcasting. That preserves the "off by default" invariant.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getServerEnv } from '../lib/env.js'

let cached: SupabaseClient | null | undefined

export function getServiceClient(): SupabaseClient | null {
  if (cached !== undefined) return cached
  const env = getServerEnv()
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    cached = null
    return cached
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } },
  })
  return cached
}

export function hasSupabase(): boolean {
  return getServiceClient() !== null
}
