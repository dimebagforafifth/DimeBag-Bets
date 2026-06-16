/**
 * A PostgREST-backed OddsCache writer — the server-side sink the poller upserts the
 * three cache tables through (odds_events / odds_markets / odds_selections). It mirrors
 * the read side (app/book/odds-source.ts) but WRITES, so it must run with the Supabase
 * SERVICE ROLE key (the migration's RLS allows public READ but no client write — ingest
 * is server-side). Returns null when Supabase isn't configured, so a poll cycle simply
 * skips instead of throwing in a cron.
 *
 * No supabase-js dependency — raw PostgREST over fetch, same style as
 * persistence/supabase/kv-transport.ts.
 */

import type { OddsCache } from './poller.js'
import type { OddsEventRow, OddsMarketRow, OddsSelectionRow, Price } from './contract.js'

type Env = Record<string, string | undefined>
type FetchLike = typeof fetch

function ambientEnv(): Env {
  return (globalThis as { process?: { env?: Env } }).process?.env ?? {}
}

interface RestCacheEnv {
  url: string
  key: string
}

/** Resolve the write credentials. Writes need the service-role key (RLS blocks anon
 *  writes on the odds tables); fall back to the anon key only if that's all there is. */
function resolveEnv(env: Env): RestCacheEnv | null {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, ''), key }
}

interface OverrideRow {
  selection_id: string
  price_display_american: number
  price_display_decimal: number
}

/**
 * Build the REST OddsCache, or null when Supabase isn't configured. Upserts are
 * idempotent on each table's primary key (Prefer: resolution=merge-duplicates).
 */
export function createRestOddsCache(
  env: Env = ambientEnv(),
  fetchImpl?: FetchLike,
): OddsCache | null {
  const resolved = resolveEnv(env)
  if (!resolved) return null
  const f = fetchImpl ?? (globalThis.fetch as FetchLike)
  const base = `${resolved.url}/rest/v1`
  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
    apikey: resolved.key,
    Authorization: `Bearer ${resolved.key}`,
    'Content-Type': 'application/json',
    ...extra,
  })

  async function upsert(table: string, rows: unknown[], onConflict: string): Promise<void> {
    if (rows.length === 0) return
    const res = await f(`${base}/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(rows),
    })
    if (!res.ok) throw new Error(`odds cache write ${table} failed (${res.status})`)
  }

  return {
    async getOverrides(eventIds: string[]): Promise<Map<string, Price>> {
      const map = new Map<string, Price>()
      if (eventIds.length === 0) return map
      const ids = eventIds.map((id) => `"${id}"`).join(',')
      const q = `event_id=in.(${ids})&override=eq.true&select=selection_id,price_display_american,price_display_decimal`
      try {
        const res = await f(`${base}/odds_selections?${q}`, { headers: headers() })
        if (!res.ok) return map // a failed override read must never kill the poll
        for (const r of (await res.json()) as OverrideRow[]) {
          map.set(r.selection_id, {
            american: r.price_display_american,
            decimal: r.price_display_decimal,
          })
        }
      } catch {
        /* tolerate — overrides are an enhancement, the slate still refreshes */
      }
      return map
    },
    writeEvents: (rows: OddsEventRow[]) => upsert('odds_events', rows, 'event_id'),
    writeMarkets: (rows: OddsMarketRow[]) => upsert('odds_markets', rows, 'market_id'),
    writeSelections: (rows: OddsSelectionRow[]) => upsert('odds_selections', rows, 'selection_id'),
  }
}
