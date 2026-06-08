/**
 * Pick the live auth backend: the real Supabase adapter when it's wired AND keys are
 * present, otherwise the local demo adapter. Until Supabase is wired this always
 * returns the demo adapter, so the app runs without external credentials.
 */

import { supabaseAuthReady } from './config.js'
import { createDemoAdapter } from './demoAdapter.js'
import { createSupabaseAdapter } from './supabaseAdapter.js'
import type { AuthAdapter } from './types.js'

export function createAuthAdapter(): AuthAdapter {
  return supabaseAuthReady() ? createSupabaseAdapter() : createDemoAdapter()
}
