/**
 * The book's odds SOURCE — the read side of the SGO cache. A framework-agnostic
 * external store (subscribe / getSnapshot / version), mirrored into React with
 * `useSyncExternalStore` (the same pattern as book-store / the ledger).
 *
 * It is seeded from the mock slate (app/book/mockBook.ts) and `connectOddsCache()`
 * flips it to the LIVE Supabase cache the feed lane's poller fills (odds_events /
 * odds_markets / odds_selections) — `assembleEvents()` re-builds NormalizedEvent[]
 * from the rows and `setSlate(..., 'live')` pushes it to every consumer. With no
 * Supabase keys the mock stays as the offline fallback, so the UI never rewrites —
 * the source just flips. Realtime push is a one-line swap (see the // SEAM there).
 *
 * The UI ALWAYS reads `priceDisplay` off these selections; it never sees the feed.
 */

import { useSyncExternalStore } from 'react'
import type {
  NormalizedEvent,
  NormalizedMarket,
  Period,
  Selection,
  OddsEventRow,
  OddsMarketRow,
  OddsSelectionRow,
} from '../../lib/odds/contract.js'
import {
  getSupabaseEnv,
  type EnvSource,
  type SupabaseEnv,
  type FetchLike,
} from '../../persistence/index.js'
import { mockSlate } from './mockBook.js'

export type OddsSourceKind = 'mock' | 'live'

interface Snapshot {
  events: NormalizedEvent[]
  source: OddsSourceKind
  version: number
}

let events: NormalizedEvent[] = mockSlate()
let source: OddsSourceKind = 'mock'
let version = 0
// Cached snapshot object: useSyncExternalStore requires getSnapshot to return a
// STABLE reference until something actually changes, or it re-renders forever.
let snapshot: Snapshot = { events, source, version }
const listeners = new Set<() => void>()

function emit(): void {
  snapshot = { events, source, version }
  listeners.forEach((l) => l())
}

/** Replace the live slate (the cache connector + tests call this). Bumps the
 *  version so every `useBookOdds()` consumer re-renders. */
export function setSlate(next: NormalizedEvent[], kind: OddsSourceKind = source): void {
  events = next
  source = kind
  version += 1
  emit()
}

/** Reset back to a fresh mock slate (tests). */
export function resetBookOdds(): void {
  events = mockSlate()
  source = 'mock'
  version += 1
  emit()
}

export function subscribeBookOdds(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getBookOddsSnapshot(): Snapshot {
  return snapshot
}

/** Whether the real feed cache is driving the slate (vs the built-in mock). */
export function isLiveOdds(): boolean {
  return source === 'live'
}

/* ----------------------- the Supabase cache read side -------------------- */
/* The feed lane's poller (lib/odds/poller.ts) WRITES the three cache tables; this
 * is the inverse — read the rows and re-assemble NormalizedEvent[] for the UI. The
 * shapes are the contract's *Row types, so this stays in lockstep with the writer. */

/** Re-assemble cache rows into NormalizedEvent[] — the exact inverse of the poller's
 *  buildRows(). Pure: markets group under their event, selections under their market. */
export function assembleEvents(
  eventRows: OddsEventRow[],
  marketRows: OddsMarketRow[],
  selectionRows: OddsSelectionRow[],
): NormalizedEvent[] {
  const selByMarket = new Map<string, Selection[]>()
  for (const r of selectionRows) {
    const sel: Selection = {
      selectionId: r.selection_id,
      side: r.side,
      ...(r.line == null ? {} : { line: r.line }),
      priceRaw: { american: r.price_raw_american, decimal: r.price_raw_decimal },
      priceDisplay: { american: r.price_display_american, decimal: r.price_display_decimal },
      bookmaker: r.bookmaker,
      available: r.available,
    }
    const list = selByMarket.get(r.market_id) ?? []
    list.push(sel)
    selByMarket.set(r.market_id, list)
  }
  const mktByEvent = new Map<string, NormalizedMarket[]>()
  for (const r of marketRows) {
    const market: NormalizedMarket = {
      marketId: r.market_id,
      type: r.type,
      period: r.period as Period,
      ...(r.stat_id == null ? {} : { statId: r.stat_id }),
      ...(r.player_id == null ? {} : { playerId: r.player_id }),
      selections: selByMarket.get(r.market_id) ?? [],
    }
    const list = mktByEvent.get(r.event_id) ?? []
    list.push(market)
    mktByEvent.set(r.event_id, list)
  }
  return eventRows.map((r) => ({
    eventId: r.event_id,
    leagueId: r.league_id,
    sport: r.sport,
    home: r.home,
    away: r.away,
    startsAt: r.starts_at,
    status: r.status,
    markets: mktByEvent.get(r.event_id) ?? [],
  }))
}

/** Reads the current cache rows. The default hits the Supabase REST API; tests inject
 *  an in-memory reader (e.g. backed by the poller's OddsCache) for the full loop. */
export interface OddsCacheReader {
  read(): Promise<{
    events: OddsEventRow[]
    markets: OddsMarketRow[]
    selections: OddsSelectionRow[]
  }>
}

/** A PostgREST reader over the three cache tables (anon key + RLS, same as the rest of
 *  the Supabase layer). Constructed only when the env keys are present. */
export function createRestOddsCacheReader(
  env: SupabaseEnv,
  fetchImpl?: FetchLike,
): OddsCacheReader {
  const f = fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const headers = { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}` }
  async function get<T>(table: string): Promise<T[]> {
    const res = await f(`${env.url}/rest/v1/${table}?select=*`, { headers })
    if (!res.ok) throw new Error(`odds cache read ${table} failed (${res.status})`)
    return (await res.json()) as T[]
  }
  return {
    async read() {
      const [events, markets, selections] = await Promise.all([
        get<OddsEventRow>('odds_events'),
        get<OddsMarketRow>('odds_markets'),
        get<OddsSelectionRow>('odds_selections'),
      ])
      return { events, markets, selections }
    },
  }
}

/** One hydrate cycle: read the cache, assemble, and push it into the store as the live
 *  source. Returns the assembled slate (awaitable in tests). */
export async function hydrateFromCache(reader: OddsCacheReader): Promise<NormalizedEvent[]> {
  const { events, markets, selections } = await reader.read()
  const assembled = assembleEvents(events, markets, selections)
  setSlate(assembled, 'live')
  return assembled
}

export interface ConnectOddsCacheOptions {
  /** Inject a reader (tests / a custom transport). Default: a REST reader from the env. */
  reader?: OddsCacheReader
  /** Inject the env source (tests); default reads the ambient SUPABASE_* keys. */
  envSource?: EnvSource
  /** Injectable fetch for the default REST reader (tests). */
  fetchImpl?: FetchLike
  /** Re-poll interval for the cache (ms). */
  intervalMs?: number
  /** Injectable scheduler (tests pass a no-op); default uses setInterval. */
  schedule?: (tick: () => void, ms: number) => () => void
  /**
   * DEV ONLY: load a pre-polled real slate from a same-origin JSON URL instead of
   * Supabase (for a local real-odds demo with no Supabase project). Defaults to the
   * `VITE_SGO_SNAPSHOT_URL` build env. Unset → normal Supabase/mock behaviour.
   */
  snapshotUrl?: string
}

/** Read a Vite build-time env var defensively (undefined outside a Vite bundle). */
function viteEnv(name: string): string | undefined {
  try {
    const meta = import.meta as unknown as { env?: Record<string, string | undefined> }
    return meta?.env?.[name]
  } catch {
    return undefined
  }
}

/**
 * DEV bridge: drive the slate from a static JSON snapshot of NormalizedEvent[] (what
 * `scripts/dev-snapshot.ts` writes from a real SGO poll), refreshing on an interval.
 * Lets the browser show REAL games with no Supabase project. Returns a disposer.
 */
export function connectSnapshot(
  url: string,
  intervalMs = 30_000,
  fetchImpl?: FetchLike,
): () => void {
  const f = fetchImpl ?? (globalThis.fetch as FetchLike)
  let disposed = false
  const tick = async (): Promise<void> => {
    if (disposed) return
    try {
      const res = await f(url)
      if (res.ok) setSlate((await res.json()) as NormalizedEvent[], 'live')
    } catch {
      /* keep the last good slate */
    }
  }
  void tick()
  const t = setInterval(() => void tick(), intervalMs)
  return () => {
    disposed = true
    clearInterval(t)
  }
}

/**
 * Connect the Supabase odds cache as the LIVE source for `useBookOdds()`.
 *
 * With the env keys present (or an injected reader) it hydrates the slate from the
 * cache tables the poller fills, then refreshes on an interval. With NO keys it is a
 * no-op and the built-in mock stays in force, so the book always renders populated —
 * the mock is the offline fallback, the flip to live is just this connect call.
 *
 *  // SEAM (realtime): the migration already adds the three tables to the
 *  `supabase_realtime` publication, so this can move from interval polling to
 *  `postgres_changes` pushes the moment a supabase-js client is added as a dep —
 *  swap the scheduler for a channel subscription; `hydrateFromCache` stays the same.
 *
 * Returns a disposer.
 */
export function connectOddsCache(opts: ConnectOddsCacheOptions = {}): () => void {
  // DEV: a local real-odds snapshot (no Supabase) takes precedence when configured.
  const snapshotUrl = opts.snapshotUrl ?? viteEnv('VITE_SGO_SNAPSHOT_URL')
  if (snapshotUrl) return connectSnapshot(snapshotUrl, opts.intervalMs)

  const reader =
    opts.reader ??
    (() => {
      const env = getSupabaseEnv(opts.envSource)
      return env ? createRestOddsCacheReader(env, opts.fetchImpl) : null
    })()
  if (!reader) return () => {} // no keys → mock fallback stays live

  let disposed = false
  const tick = () => {
    if (disposed) return
    // A failed read holds the last good slate — never throw out of the loop.
    void hydrateFromCache(reader).catch(() => {})
  }
  tick() // initial hydrate
  const schedule =
    opts.schedule ??
    ((fn, ms) => {
      const t = setInterval(fn, ms)
      return () => clearInterval(t)
    })
  const stop = schedule(tick, opts.intervalMs ?? 15_000)
  return () => {
    disposed = true
    stop()
  }
}

/** React hook: the current slate + which source is driving it. */
export function useBookOdds(): Snapshot {
  return useSyncExternalStore(subscribeBookOdds, getBookOddsSnapshot, getBookOddsSnapshot)
}

/** React hook: a single event by id (or null), re-rendering on slate changes. */
export function useBookEvent(eventId: string | null): NormalizedEvent | null {
  const { events: list } = useBookOdds()
  if (!eventId) return null
  return list.find((e) => e.eventId === eventId) ?? null
}
