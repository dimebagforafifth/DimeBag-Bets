/**
 * The odds poller (server-side). Pulls the slate from the ACTIVE provider, normalizes it,
 * and writes the three Supabase cache tables (odds_events / odds_markets / odds_selections).
 * Players never hit a provider — they read the cache (realtime), which this fills.
 *
 * Two invariants:
 *  1. CONSERVE OBJECTS — default to MockProvider; only use the real SGO feed when explicitly
 *     enabled (env SGO_LIVE=1 + a key). Poll active leagues only. SGO bills per EVENT, so the
 *     lever is fewer events/leagues/poll-rate, not fewer markets.
 *  2. OVERRIDES WIN — before each write the poller reads the cache's existing manual overrides
 *     and feeds them back through pricing.applyPricing, so a hand-set line is refreshed in
 *     priceRaw (trader reference) but its priceDisplay is NEVER clobbered by the new feed.
 */

import type {
  NormalizedEvent,
  OddsEventRow,
  OddsMarketRow,
  OddsSelectionRow,
  OddsFeedProvider,
  Price,
} from './contract.js'
import { applyPricing, DEFAULT_MARGIN } from './pricing.js'
import { MockProvider } from './providers/MockProvider.js'
import { SGOProvider } from './providers/SGOProvider.js'

/*
 * SGO league codes we poll. These are SGO's exact, case-sensitive `leagueID` values,
 * verified against the SportsGameOdds league reference
 * (https://sportsgameodds.com/docs/data-types/leagues): EPL = English Premier League
 * (sportID SOCCER), UFC = UFC (sportID MMA). The codes are CORRECT — when EPL/UFC 400 it
 * is the free tier NOT including that sport (an out-of-plan league returns 4xx, not an
 * empty list), not a bad code. The poll is ISOLATED PER LEAGUE (see Poller.pollOnce), so
 * a 4xx on one league is skipped — never fatal — and the rest of the slate still caches.
 */

/** Leagues empirically confirmed to return live odds (NBA / MLB / NFL / NHL). */
export const CORE_LEAGUES = ['NFL', 'NBA', 'MLB', 'NHL'] as const
/** Correct codes, but plan-gated on the free tier (soccer/MMA/college can 4xx). Attempted
 *  every cycle and skipped if they fail; verify with one SGO_LIVE=1 poll once a paid key
 *  is provisioned, then promote any that resolve into CORE_LEAGUES. */
export const EXTENDED_LEAGUES = ['NCAAF', 'NCAAB', 'EPL', 'UFC'] as const
/** Everything we attempt to poll — core first, then the plan-gated extras. */
export const ACTIVE_LEAGUES = [...CORE_LEAGUES, ...EXTENDED_LEAGUES] as const
/** Documented SGO gaps — present so the wiring lane sees the intended scope, not polled. */
export const SCAFFOLDED_LEAGUES = ['BOXING'] as const

/** Reference: more SGO leagueIDs (by sport) to promote into EXTENDED_LEAGUES once the plan
 *  supports them. Codes verified against the SGO league docs. */
export const SGO_LEAGUE_REFERENCE = {
  /** sportID SOCCER */
  soccer: ['EPL', 'UEFA_CHAMPIONS_LEAGUE', 'LA_LIGA', 'BUNDESLIGA'],
  /** sportID MMA */
  mma: ['UFC'],
} as const

/** The cache seam the poller writes through — abstracted so it unit-tests with a fake. */
export interface OddsCache {
  /** Existing manual-override display prices for these events, by selectionId (override=true). */
  getOverrides(eventIds: string[]): Promise<Map<string, Price>>
  /** Upsert the normalized rows (idempotent on the primary keys). */
  writeEvents(rows: OddsEventRow[]): Promise<void>
  writeMarkets(rows: OddsMarketRow[]): Promise<void>
  writeSelections(rows: OddsSelectionRow[]): Promise<void>
}

export interface PollerConfig {
  provider?: OddsFeedProvider
  cache: OddsCache
  leagues?: readonly string[]
  margin?: number
  /** ISO timestamp source (injectable for deterministic tests). */
  now?: () => string
  /** Called when ONE league's fetch fails (e.g. a plan-gated league 4xx's). The cycle
   *  isolates the failure, skips that league, and keeps polling the rest — this is just a
   *  hook for logging/telemetry so a deploy can SEE which leagues didn't resolve. */
  onLeagueError?: (league: string, error: unknown) => void
}

export interface PollResult {
  events: number
  markets: number
  selections: number
  overridesPreserved: number
}

/** Flatten a slate into cache rows, preserving overrides. Pure (given `overrides` + `now`). */
export function buildRows(
  events: NormalizedEvent[],
  overrides: Map<string, Price>,
  margin: number,
  now: string,
): {
  events: OddsEventRow[]
  markets: OddsMarketRow[]
  selections: OddsSelectionRow[]
  overridesPreserved: number
} {
  const eventRows: OddsEventRow[] = []
  const marketRows: OddsMarketRow[] = []
  const selectionRows: OddsSelectionRow[] = []
  let overridesPreserved = 0

  for (const e of events) {
    eventRows.push({
      event_id: e.eventId,
      league_id: e.leagueId,
      sport: e.sport,
      home: e.home,
      away: e.away,
      starts_at: e.startsAt,
      status: e.status,
      updated_at: now,
    })
    for (const m of e.markets) {
      marketRows.push({
        market_id: m.marketId,
        event_id: e.eventId,
        type: m.type,
        period: m.period,
        stat_id: m.statId ?? null,
        player_id: m.playerId ?? null,
        updated_at: now,
      })
      for (const s of m.selections) {
        const override = overrides.get(s.selectionId) ?? null
        // applyPricing ALWAYS recomputes display from the fresh raw price (margin), unless an
        // override is supplied — then the override wins and the manual line is preserved.
        const priced = applyPricing(s.priceRaw, { margin, override })
        if (priced.override) overridesPreserved++
        selectionRows.push({
          selection_id: s.selectionId,
          market_id: m.marketId,
          event_id: e.eventId,
          side: s.side,
          line: s.line ?? null,
          price_raw_american: priced.priceRaw.american,
          price_raw_decimal: priced.priceRaw.decimal,
          price_display_american: priced.priceDisplay.american,
          price_display_decimal: priced.priceDisplay.decimal,
          bookmaker: s.bookmaker,
          available: s.available,
          override: priced.override,
          updated_at: now,
        })
      }
    }
  }
  return { events: eventRows, markets: marketRows, selections: selectionRows, overridesPreserved }
}

export class Poller {
  private readonly provider: OddsFeedProvider
  private readonly cache: OddsCache
  private readonly leagues: readonly string[]
  private readonly margin: number
  private readonly now: () => string
  private readonly onLeagueError: (league: string, error: unknown) => void
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(cfg: PollerConfig) {
    this.provider = cfg.provider ?? selectProvider()
    this.cache = cfg.cache
    this.leagues = cfg.leagues ?? ACTIVE_LEAGUES
    this.margin = cfg.margin ?? DEFAULT_MARGIN
    this.now = cfg.now ?? (() => new Date().toISOString())
    this.onLeagueError = cfg.onLeagueError ?? (() => {})
  }

  /**
   * One poll cycle: fetch EACH league independently → preserve overrides → write the cache.
   * Polling per-league ISOLATES failures — a plan-gated league that 4xx's (EPL/UFC on the
   * free tier) is skipped via `onLeagueError`, and every other league still caches. SGO
   * bills per EVENT returned, so splitting one multi-league request into per-league requests
   * costs the same. Returns counts across the leagues that resolved.
   */
  async pollOnce(): Promise<PollResult> {
    // One group per league (or a single no-filter group when no leagues are configured).
    const groups = this.leagues.length ? this.leagues.map((l) => [l]) : [[] as string[]]
    const events: NormalizedEvent[] = []
    for (const group of groups) {
      try {
        const slate = await this.provider.listEvents(group, { includeAltLines: true })
        events.push(...slate)
      } catch (err) {
        // Isolate: this league failed (likely plan-gated). Skip it, keep the cycle alive.
        this.onLeagueError(group.join(',') || 'all', err)
      }
    }
    const overrides = await this.cache.getOverrides(events.map((e) => e.eventId))
    const rows = buildRows(events, overrides, this.margin, this.now())
    // Events + markets first (FK parents), then selections.
    await this.cache.writeEvents(rows.events)
    await this.cache.writeMarkets(rows.markets)
    await this.cache.writeSelections(rows.selections)
    return {
      events: rows.events.length,
      markets: rows.markets.length,
      selections: rows.selections.length,
      overridesPreserved: rows.overridesPreserved,
    }
  }

  /** Schedule polling on an interval. Guards against overlapping cycles. */
  start(intervalMs: number): void {
    if (this.timer) return
    const tick = async () => {
      if (this.running) return
      this.running = true
      try {
        await this.pollOnce()
      } catch {
        /* a failed poll holds the last good cache — never throw out of the loop */
      } finally {
        this.running = false
      }
    }
    void tick()
    this.timer = setInterval(tick, intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}

/**
 * Pick the active provider. DEFAULT = mock (zero SGO objects). The real SGO feed is used
 * only when SGO_LIVE is truthy AND a key is configured — so a routine dev/test run never
 * touches the free tier by accident.
 */
export function selectProvider(): OddsFeedProvider {
  const env =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
  const live = env.SGO_LIVE === '1' || env.SGO_LIVE === 'true'
  if (live) {
    const sgo = new SGOProvider()
    if (sgo.configured) return sgo
  }
  return new MockProvider()
}

/**
 * Supabase-backed cache. `client` is a supabase-js client; kept loosely typed so this lane
 * doesn't hard-depend on the SDK version. Upserts are idempotent on the table PKs.
 */
export function createSupabaseOddsCache(client: SupabaseLike): OddsCache {
  return {
    async getOverrides(eventIds) {
      const map = new Map<string, Price>()
      if (eventIds.length === 0) return map
      const { data, error } = await client
        .from('odds_selections')
        .select('selection_id, price_display_american, price_display_decimal')
        .eq('override', true)
        .in('event_id', eventIds)
      if (error) throw new Error(`odds cache override read failed: ${error.message}`)
      for (const r of (data ?? []) as OverrideRow[]) {
        map.set(r.selection_id, {
          american: r.price_display_american,
          decimal: r.price_display_decimal,
        })
      }
      return map
    },
    async writeEvents(rows) {
      if (rows.length) await upsert(client, 'odds_events', rows, 'event_id')
    },
    async writeMarkets(rows) {
      if (rows.length) await upsert(client, 'odds_markets', rows, 'market_id')
    },
    async writeSelections(rows) {
      if (rows.length) await upsert(client, 'odds_selections', rows, 'selection_id')
    },
  }
}

interface OverrideRow {
  selection_id: string
  price_display_american: number
  price_display_decimal: number
}

/** The minimal supabase-js surface the cache uses. */
export interface SupabaseLike {
  from(table: string): {
    select(cols: string): {
      eq(
        col: string,
        val: unknown,
      ): {
        in(
          col: string,
          vals: unknown[],
        ): Promise<{ data: unknown[] | null; error: { message: string } | null }>
      }
    }
    upsert(
      rows: unknown[],
      opts: { onConflict: string },
    ): Promise<{ error: { message: string } | null }>
  }
}

async function upsert(
  client: SupabaseLike,
  table: string,
  rows: unknown[],
  onConflict: string,
): Promise<void> {
  const { error } = await client.from(table).upsert(rows, { onConflict })
  if (error) throw new Error(`odds cache write to ${table} failed: ${error.message}`)
}
