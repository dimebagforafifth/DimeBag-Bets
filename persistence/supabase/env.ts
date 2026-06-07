/**
 * Supabase configuration seam (CLAUDE.md §6 — Supabase is the one backend service).
 *
 * The whole server-data layer is *off* until the operator drops in two keys. This
 * module is the single place that reads them, so every other file just asks
 * `isSupabaseConfigured()` / `getSupabaseEnv()` and never touches `process.env` /
 * `import.meta.env` itself. No keys → everything upstream falls back to the current
 * localStorage / in-process behaviour, exactly as before.
 *
 * Env is read from both worlds the app runs in:
 *   - `process.env`        — Node, Vercel functions/edge, and Vitest.
 *   - `import.meta.env`    — the Vite browser build.
 * Either `SUPABASE_URL` or the Vite-exposed `VITE_SUPABASE_URL` is accepted (same
 * for the anon key), so the operator can use whichever their deploy target wants.
 *
 * Reads are injectable (`source`) so tests are deterministic and never depend on
 * the ambient environment.
 */

/** Resolved Supabase connection details. Present only when both keys are set. */
export interface SupabaseEnv {
  /** The project URL, e.g. `https://abcd.supabase.co` (no trailing slash). */
  url: string
  /** The anon (public) API key — safe for the browser; RLS does the gatekeeping. */
  anonKey: string
}

/** A bag of env vars. Real env is `process.env` / `import.meta.env`; tests pass one in. */
export type EnvSource = Record<string, string | undefined>

/** Read one var from `process.env`, then the Vite `import.meta.env`, else undefined. */
function readAmbient(name: string): string | undefined {
  // Node / Vercel / edge / Vitest.
  if (typeof process !== 'undefined' && process.env && process.env[name] != null) {
    return process.env[name]
  }
  // Vite browser build. `import.meta.env` isn't typed without vite/client, and
  // isn't present in every runtime, so reach for it defensively.
  try {
    const meta = import.meta as unknown as { env?: Record<string, string | undefined> }
    if (meta?.env && meta.env[name] != null) return meta.env[name]
  } catch {
    /* import.meta.env unavailable in this runtime — ignore */
  }
  return undefined
}

/** First non-empty value among `names`, from the given source (default: ambient env). */
function pick(source: EnvSource | undefined, names: string[]): string | undefined {
  for (const name of names) {
    const v = source ? source[name] : readAmbient(name)
    if (v != null && v !== '') return v
  }
  return undefined
}

const URL_KEYS = ['SUPABASE_URL', 'VITE_SUPABASE_URL']
const ANON_KEYS = ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']

/**
 * The resolved Supabase env, or `null` when either key is missing. A trailing slash
 * on the URL is trimmed so callers can join paths with a single `/`.
 */
export function getSupabaseEnv(source?: EnvSource): SupabaseEnv | null {
  const url = pick(source, URL_KEYS)
  const anonKey = pick(source, ANON_KEYS)
  if (!url || !anonKey) return null
  return { url: url.replace(/\/+$/, ''), anonKey }
}

/** True when both keys are present — i.e. the server data layer should switch on. */
export function isSupabaseConfigured(source?: EnvSource): boolean {
  return getSupabaseEnv(source) !== null
}
