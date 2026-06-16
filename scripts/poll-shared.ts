/**
 * Shared bits for the local poll scripts. Resolves the cache the poll cycle writes:
 * the real Supabase cache when configured, else an in-memory counting cache so you can
 * watch the loop tick locally without provisioning Supabase.
 */
import { createRestOddsCache, type OddsCache } from '../lib/odds/index.js'

function memoryCache(): OddsCache {
  return {
    async getOverrides() {
      return new Map()
    },
    async writeEvents() {},
    async writeMarkets() {},
    async writeSelections() {},
  }
}

export function resolveCache(): { cache: OddsCache; label: string } {
  const rest = createRestOddsCache()
  if (rest) return { cache: rest, label: 'supabase' }
  return { cache: memoryCache(), label: 'in-memory (no Supabase configured — counts only)' }
}
