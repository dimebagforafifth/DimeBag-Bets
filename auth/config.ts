/**
 * Which auth backend is live. We reuse the persistence module's single env seam
 * (`isSupabaseConfigured`, which reads SUPABASE_URL / VITE_SUPABASE_URL + the anon
 * key) so auth and the data layer agree on "are we configured" and nobody forks the
 * env reading.
 */

import { isSupabaseConfigured } from '../persistence/index.js'

/**
 * Flip to `true` once auth/supabaseAdapter.ts is fully implemented AND
 * `@supabase/supabase-js` is added as a dependency. Until then we always use the demo
 * adapter so the app runs with no external credentials — exactly the "fall back to
 * current behavior until keys are provided" rule. // TODO(api)
 */
export const SUPABASE_AUTH_WIRED = false

/** True only when the real Supabase auth path should run (wired AND keys present). */
export function supabaseAuthReady(): boolean {
  return SUPABASE_AUTH_WIRED && isSupabaseConfigured()
}
