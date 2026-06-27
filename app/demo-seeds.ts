/**
 * The single gate for ALL demo seeding (records, projection, rewards, social).
 *
 * Demo seeding fabricates history (mock players like 'p-marco', sample slips, ranks) so the
 * local/mock build renders fully populated. A real/production user must NOT see invented data,
 * so every seed default flows through `demoSeedsEnabled()`.
 *
 * Policy:
 *   - explicit override `VITE_DEMO_SEEDS=on`  → always ON,
 *   - explicit override `VITE_DEMO_SEEDS=off` → always OFF,
 *   - otherwise: ON in dev (`import.meta.env.DEV`), OFF in production.
 *
 * Reads `import.meta.env` directly (not lib/env) because that bag isn't typed/known there and
 * because `DEV` is a Vite-only build flag. Robust when `import.meta.env` is absent (e.g. Node /
 * Vitest with no Vite shim) — then there's no override and no DEV flag, so it returns false.
 *
 * This only sets the DEFAULT. The stores keep their explicit test hooks
 * (`__setRecordsSeed` / `__setProjectionSeed`) so tests can force seeding on/off regardless.
 */

/** Read one Vite env var defensively (absent `import.meta.env` → undefined). */
function readMetaEnv(name: string): string | undefined {
  try {
    const meta = import.meta as unknown as { env?: Record<string, unknown> }
    const v = meta?.env?.[name]
    return typeof v === 'string' ? v : undefined
  } catch {
    return undefined
  }
}

/** True when `import.meta.env.DEV` is set (the Vite dev/test build flag). */
function isDev(): boolean {
  try {
    const meta = import.meta as unknown as { env?: { DEV?: unknown } }
    return meta?.env?.DEV === true
  } catch {
    return false
  }
}

/**
 * Whether demo seeding should be ON by default. Explicit `VITE_DEMO_SEEDS` override wins
 * (`'on'`/`'off'`); otherwise ON only in dev. OFF in production and when env is unavailable.
 */
export function demoSeedsEnabled(): boolean {
  const override = readMetaEnv('VITE_DEMO_SEEDS')?.trim().toLowerCase()
  if (override === 'on') return true
  if (override === 'off') return false
  return isDev()
}
