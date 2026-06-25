/**
 * Central environment-variable schema + startup validation (the one place env is read).
 *
 * WHY THIS EXISTS
 * Before this module, env vars were read ad-hoc all over the codebase (`process.env.X`,
 * `import.meta.env.X`, `Number(process.env.Y)`), each call site re-implementing the
 * Node-vs-Vite duality and its own coercion/fallback. There was no startup check, so a
 * misconfigured production deploy (a missing `FAIRNESS_SECRET`, a typo'd `PORT`) failed
 * silently and lazily at the first request that happened to touch it.
 *
 * This module is the SINGLE trust boundary for configuration:
 *   - `readEnv` / `ambientEnv` are the ONLY physical reads of `process.env` / `import.meta.env`.
 *     The existing seams (persistence/supabase/env, auth/config, app/alert-transport) delegate
 *     here instead of duplicating the dual-runtime logic.
 *   - `serverEnvSchema` is the zod schema describing every known var, coercing numeric/boolean
 *     knobs to their real types so callers stop doing `Number(process.env.X)` by hand.
 *   - `validateServerEnv()` is the STARTUP GATE the server entry points (api/* handlers,
 *     worker/index) call once. In production it HARD-FAILS (throws) on a missing required var
 *     or a malformed value; outside production it logs the same problems as warnings and falls
 *     back to safe defaults, preserving the repo's "runs locally with nothing configured"
 *     invariant.
 *
 * INERT-WITHOUT-KEYS IS PRESERVED. Almost everything is optional: with an empty env the schema
 * parses to all-undefined and the app degrades to localStorage + the mock odds slate exactly as
 * before. The only var REQUIRED in production is `FAIRNESS_SECRET` (the built-in fallback is an
 * insecure dev-only secret — see core/fairness-authority.ts), plus the structural rule that
 * Supabase URL and anon key must be set together.
 *
 * This file imports nothing from the app (only `zod`), so it is a safe leaf for every runtime —
 * Node, Vercel functions/edge, the Vite browser build, and Vitest.
 */

import { z } from 'zod'

/** A bag of env vars. The real environment is `process.env` / `import.meta.env`; tests pass one in. */
export type EnvSource = Record<string, string | undefined>

// ── Physical env access (the only place process.env / import.meta.env are touched) ───────────

/**
 * Read one variable, from an explicit `source` when given (tests / injected bags), else from the
 * ambient environment: `process.env` first (Node / Vercel / edge / Vitest), then the Vite
 * `import.meta.env` (browser build). Returns `undefined` when unset. An explicitly-set empty
 * string is returned as `''` (callers decide whether to treat it as absent) — this matches the
 * `!= null` semantics the previous per-file readers used.
 */
export function readEnv(name: string, source?: EnvSource): string | undefined {
  if (source) return source[name]
  // Node / Vercel / edge / Vitest.
  if (typeof process !== 'undefined' && process.env && process.env[name] != null) {
    return process.env[name]
  }
  // Vite browser build. `import.meta.env` isn't typed without vite/client and isn't present in
  // every runtime, so reach for it defensively.
  try {
    const meta = import.meta as unknown as { env?: Record<string, string | undefined> }
    if (meta?.env && meta.env[name] != null) return meta.env[name]
  } catch {
    /* import.meta.env unavailable in this runtime — ignore */
  }
  return undefined
}

/**
 * The ambient environment as one merged bag. `import.meta.env` is laid down first and
 * `process.env` overrides it, so a server var always wins over a stale Vite-exposed one. Used by
 * callers that need to hand a whole env bag to another function (e.g. resolveMasterSecret).
 */
export function ambientEnv(): EnvSource {
  const out: EnvSource = {}
  try {
    const meta = (import.meta as unknown as { env?: EnvSource }).env
    if (meta) Object.assign(out, meta)
  } catch {
    /* import.meta.env unavailable in this runtime — ignore */
  }
  if (typeof process !== 'undefined' && process.env) Object.assign(out, process.env as EnvSource)
  return out
}

// ── Field coercions (lenient: absent / empty / malformed → undefined, never throws) ──────────
// The schema below is the OUTPUT contract — it always parses. Strictness (rejecting a malformed
// value) is enforced separately by `collectEnvIssues`, so production can fail loudly while local
// dev degrades to defaults.

/** Treat absent / null / empty / whitespace-only as "unset" before the inner schema runs. */
const emptyToUndefined = (v: unknown): unknown =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v

/** Optional non-empty string. */
const optionalString = z.preprocess(emptyToUndefined, z.string().optional()).catch(undefined)

/** Optional positive integer (a duration/count knob), e.g. `LIVE_POLL_MS=4000`. */
const optionalPositiveInt = z
  .preprocess(emptyToUndefined, z.coerce.number().int().positive().optional())
  .catch(undefined)

/** Optional TCP port (1..65535). */
const optionalPort = z
  .preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).optional())
  .catch(undefined)

/**
 * A boolean toggle that is ON by default and OFF only when explicitly `'0'` / `'false'`. Mirrors
 * the worker's `on()` helper so RUN_ODDS_POLLER / RUN_CRASH_CLOCK keep their exact semantics.
 */
const flagDefaultOn = z
  .union([z.string(), z.boolean(), z.null(), z.undefined()])
  .transform((v) => v !== '0' && v !== 'false' && v !== false)
  .catch(true)

/**
 * The full known-variable registry. Unknown keys are stripped (the parsed object exposes only
 * the documented config), so callers that need the raw bag use `ambientEnv()` instead.
 */
export const serverEnvSchema = z.object({
  // Runtime / platform.
  NODE_ENV: optionalString,
  VERCEL_ENV: optionalString,

  // Provably-fair authority (api/fairness, worker/crashClock).
  FAIRNESS_SECRET: optionalString,
  FAIRNESS_COMMIT_RATE_LIMIT_MAX: optionalPositiveInt,
  FAIRNESS_COMMIT_RATE_LIMIT_WINDOW_MS: optionalPositiveInt,

  // Cron auth (api/poll-odds, api/run-promos).
  CRON_SECRET: optionalString,

  // Supabase data layer + odds cache.
  SUPABASE_URL: optionalString,
  SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  VITE_SUPABASE_URL: optionalString,
  VITE_SUPABASE_ANON_KEY: optionalString,

  // Supabase auth knobs.
  SUPABASE_AUTH_EMAIL_DOMAIN: optionalString,
  VITE_SUPABASE_AUTH_EMAIL_DOMAIN: optionalString,
  SUPABASE_AUTH_REDIRECT_URL: optionalString,
  VITE_SUPABASE_AUTH_REDIRECT_URL: optionalString,

  // Sportsbook odds feed.
  SGO_LIVE: optionalString,
  SPORTS_ODDS_API_KEY_HEADER: optionalString,
  ODDS_API_KEY: optionalString,
  VITE_ODDS_API_KEY: optionalString,
  VITE_SGO_SNAPSHOT_URL: optionalString,
  POLL_INTERVAL_SECONDS: optionalPositiveInt,

  // Always-on worker cadences + toggles.
  LIVE_POLL_MS: optionalPositiveInt,
  PREMATCH_POLL_MS: optionalPositiveInt,
  CRASH_BETTING_MS: optionalPositiveInt,
  CRASH_TICK_MS: optionalPositiveInt,
  CRASH_COOLDOWN_MS: optionalPositiveInt,
  PORT: optionalPort,
  RUN_ODDS_POLLER: flagDefaultOn,
  RUN_CRASH_CLOCK: flagDefaultOn,
})

/** The parsed, typed, coerced server environment. */
export type ServerEnv = z.infer<typeof serverEnvSchema>

/** Parse the ambient (or given) env into the typed, coerced shape. Never throws. */
export function parseServerEnv(source?: EnvSource): ServerEnv {
  return serverEnvSchema.parse(source ?? ambientEnv())
}

// ── Strictness policy: what counts as a misconfiguration (drives the prod hard-fail) ─────────

/** The positive-integer knobs whose malformed values should be flagged (not silently defaulted). */
const POSITIVE_INT_VARS = [
  'FAIRNESS_COMMIT_RATE_LIMIT_MAX',
  'FAIRNESS_COMMIT_RATE_LIMIT_WINDOW_MS',
  'POLL_INTERVAL_SECONDS',
  'LIVE_POLL_MS',
  'PREMATCH_POLL_MS',
  'CRASH_BETTING_MS',
  'CRASH_TICK_MS',
  'CRASH_COOLDOWN_MS',
] as const

function isMalformedPositiveInt(raw: string | undefined): boolean {
  if (raw == null) return false
  const t = raw.trim()
  if (t === '') return false // unset → use the default, not an error
  const n = Number(t)
  return !Number.isInteger(n) || n <= 0
}

function isMalformedPort(raw: string | undefined): boolean {
  if (raw == null) return false
  const t = raw.trim()
  if (t === '') return false
  const n = Number(t)
  return !Number.isInteger(n) || n < 1 || n > 65535
}

function firstNonEmpty(source: EnvSource | undefined, names: string[]): string | undefined {
  for (const name of names) {
    const v = readEnv(name, source)
    if (v != null && v.trim() !== '') return v
  }
  return undefined
}

/** True when the deploy is production (Node `NODE_ENV` or Vercel `VERCEL_ENV`). */
export function isProductionEnv(source?: EnvSource): boolean {
  return (
    readEnv('NODE_ENV', source) === 'production' || readEnv('VERCEL_ENV', source) === 'production'
  )
}

/**
 * Collect every configuration problem in `source`, in human-readable form. These are HARD errors
 * in production (thrown) and warnings everywhere else:
 *   - a numeric knob set to a non-positive-integer / out-of-range value (would silently default);
 *   - `FAIRNESS_SECRET` missing in production (refuses to ship on the insecure dev fallback);
 *   - Supabase URL set without its anon key, or vice versa (a half-configured backend).
 */
export function collectEnvIssues(source: EnvSource | undefined, production: boolean): string[] {
  const issues: string[] = []

  for (const key of POSITIVE_INT_VARS) {
    const raw = readEnv(key, source)
    if (isMalformedPositiveInt(raw)) {
      issues.push(`${key} must be a positive integer (got ${JSON.stringify(raw)})`)
    }
  }

  const port = readEnv('PORT', source)
  if (isMalformedPort(port)) {
    issues.push(`PORT must be an integer in 1..65535 (got ${JSON.stringify(port)})`)
  }

  if (production) {
    const secret = readEnv('FAIRNESS_SECRET', source)
    if (!secret || secret.trim() === '') {
      issues.push(
        'FAIRNESS_SECRET is required in production — the built-in dev fallback is insecure; set a strong random value',
      )
    }
  }

  const url = firstNonEmpty(source, ['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const anonKey = firstNonEmpty(source, ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'])
  if (Boolean(url) !== Boolean(anonKey)) {
    issues.push(
      'SUPABASE_URL and SUPABASE_ANON_KEY must be set together (one is configured without the other)',
    )
  }

  return issues
}

/** Thrown by `validateServerEnv` when production configuration is invalid. Carries every issue. */
export class EnvValidationError extends Error {
  readonly issues: string[]
  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`)
    this.name = 'EnvValidationError'
    this.issues = issues
  }
}

export interface ValidateServerEnvOptions {
  /** Env to validate (tests / injected bags). Defaults to the ambient environment. */
  source?: EnvSource
  /** Force the production/non-production decision (tests). Defaults to auto-detection. */
  production?: boolean
  /** Where non-fatal (dev) warnings go. Defaults to `console.warn`; injectable for tests. */
  warn?: (message: string) => void
}

/**
 * The STARTUP GATE. Call once at each server entry point (api/* `handler`, worker `main`).
 *
 * In production: throws `EnvValidationError` listing every problem — the deploy refuses to serve
 * a misconfigured environment rather than failing lazily at the first affected request.
 * Otherwise: logs the same problems as warnings and returns best-effort defaults, so local dev
 * and tests keep running with nothing (or partially) configured.
 *
 * Returns the parsed, typed env for convenience (same value as `getServerEnv`).
 */
export function validateServerEnv(opts: ValidateServerEnvOptions = {}): ServerEnv {
  const source = opts.source ?? ambientEnv()
  const production = opts.production ?? isProductionEnv(source)
  const issues = collectEnvIssues(source, production)

  if (issues.length > 0) {
    if (production) throw new EnvValidationError(issues)
    const warn = opts.warn ?? ((m: string) => console.warn(m))
    warn('[env] configuration warnings (non-production — falling back to safe defaults):')
    for (const issue of issues) warn(`[env]   - ${issue}`)
  }

  return parseServerEnv(source)
}

let cachedServerEnv: ServerEnv | undefined

/**
 * The parsed, typed server env for reading individual values (`getServerEnv().PORT`, etc.). The
 * ambient parse is cached per process; pass an explicit `source` to parse a one-off bag (tests,
 * which also skips the cache).
 */
export function getServerEnv(source?: EnvSource): ServerEnv {
  if (source) return parseServerEnv(source)
  if (!cachedServerEnv) cachedServerEnv = parseServerEnv(ambientEnv())
  return cachedServerEnv
}

/** Clear the cached ambient env (tests that mutate `process.env`). */
export function resetServerEnvCache(): void {
  cachedServerEnv = undefined
}
