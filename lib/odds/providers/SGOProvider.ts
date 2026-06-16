/**
 * SGOProvider — maps the SportsGameOdds (SGO) v2 feed into the shared NormalizedEvent
 * model (lib/odds/contract).
 *
 * SOURCE OF TRUTH: built to SGO's published OpenAPI spec (GET /v2/events). The shapes
 * below mirror the documented response; the exact ALT-LINE wire format and the response
 * envelope could not be verified against a live call in this environment (no SGO MCP /
 * API key wired) — see the // SEAM notes and verify against a real response before prod.
 *
 * SGO oddID format:  {statID}-{statEntityID}-{periodID}-{betTypeID}-{sideID}
 *   e.g. "points-home-game-ml-home"  →  game moneyline, home side
 * Prices live under  odds.<oddID>.byBookmaker.<bookmakerID>  as American strings.
 *
 * Auth: x-api-key header, value from env SPORTS_ODDS_API_KEY_HEADER (never hardcoded).
 * Billing is PER EVENT returned (not per market/bookmaker) — so the poller conserves
 * free-tier objects by limiting events/leagues/poll-rate, and asks for everything it
 * needs (markets + bookmakers) in one request.
 */

import type {
  ListEventsOptions,
  NormalizedEvent,
  NormalizedMarket,
  OddsFeedProvider,
  Selection,
  EventStatus,
  MarketType,
} from '../contract.js'
import { applyMargin, priceFromAmerican, DEFAULT_MARGIN } from '../pricing.js'

const SGO_BASE_URL = 'https://api.sportsgameodds.com/v2'
/** Bookmakers we prefer to source a price from, best-first. */
const DEFAULT_BOOKMAKERS = ['draftkings', 'fanduel', 'betmgm', 'caesars']

export interface SGOProviderConfig {
  /** API key value; defaults to env SPORTS_ODDS_API_KEY_HEADER. */
  apiKey?: string
  baseUrl?: string
  /** Preferred bookmakers, best-first, for sourcing each selection's price. */
  bookmakers?: string[]
  /** House margin applied to fill each selection's display price. */
  margin?: number
  /** Injectable fetch (defaults to global fetch) so the mapping is unit-testable. */
  fetchImpl?: typeof fetch
}

/* ───────────────── SGO response shapes (the bits we read) ───────────────── */

interface SGOBookmakerOdds {
  bookmakerID?: string
  odds?: string | number // American, e.g. "+110" / "-110"
  spread?: string | number
  overUnder?: string | number
  available?: boolean
  isMainLine?: boolean
  lastUpdatedAt?: string
}
interface SGOOdd {
  oddID: string
  statID?: string
  statEntityID?: string
  periodID?: string
  betTypeID?: string
  sideID?: string
  playerID?: string
  marketName?: string
  bookOddsAvailable?: boolean
  byBookmaker?: Record<string, SGOBookmakerOdds>
}
interface SGOEvent {
  eventID: string
  sportID?: string
  leagueID?: string
  status?: {
    startsAt?: string
    started?: boolean
    live?: boolean
    ended?: boolean
    finalized?: boolean
    completed?: boolean
    cancelled?: boolean
  }
  teams?: {
    home?: { names?: { short?: string; medium?: string; long?: string }; teamID?: string }
    away?: { names?: { short?: string; medium?: string; long?: string }; teamID?: string }
  }
  odds?: Record<string, SGOOdd>
}
interface SGOListResponse {
  success?: boolean
  data?: SGOEvent[]
  nextCursor?: string | null
}

/* ──────────────────────── pure mapping (testable) ──────────────────────── */

export interface ParsedOddId {
  statID: string
  statEntityID: string
  periodID: string
  betTypeID: string
  sideID: string
}

/** Parse an SGO oddID `{statID}-{statEntityID}-{periodID}-{betTypeID}-{sideID}`.
 *  Returns null if it doesn't have the 5 segments. statID itself may contain no dashes
 *  in SGO's scheme, so a strict 5-part split is correct. */
export function parseOddId(oddID: string): ParsedOddId | null {
  const parts = oddID.split('-')
  if (parts.length !== 5) return null
  const [statID, statEntityID, periodID, betTypeID, sideID] = parts
  return { statID, statEntityID, periodID, betTypeID, sideID }
}

/** SGO betTypeID → our MarketType. ml→moneyline, sp→spread, ou→total, else→prop. */
export function marketTypeOf(betTypeID: string, hasPlayer: boolean): MarketType {
  if (betTypeID === 'ml') return 'moneyline'
  if (betTypeID === 'sp') return 'spread'
  if (betTypeID === 'ou') return 'total'
  return hasPlayer ? 'prop' : 'prop' // any non-core betType is treated as a prop market
}

/** Derive our 3-state status from SGO's flags. */
export function statusOf(s: SGOEvent['status']): EventStatus {
  if (!s) return 'pre'
  if (s.ended || s.finalized || s.completed || s.cancelled) return 'ended'
  if (s.live || s.started) return 'live'
  return 'pre'
}

function toAmerican(v: string | number | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseInt(v.replace?.('+', '') ?? v, 10)
  return Number.isFinite(n) && n !== 0 ? n : null
}
function toLine(v: string | number | undefined): number | undefined {
  if (v == null || v === '') return undefined
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}

/** Pick the price to source for a selection: first available preferred bookmaker, else
 *  the main line, else the first entry. Returns the chosen bookmaker id + its odds. */
function pickBookmaker(
  byBookmaker: Record<string, SGOBookmakerOdds> | undefined,
  preferred: string[],
): { id: string; o: SGOBookmakerOdds } | null {
  if (!byBookmaker) return null
  const entries = Object.entries(byBookmaker).map(([id, o]) => ({ id: o.bookmakerID ?? id, o }))
  const usable = entries.filter((e) => toAmerican(e.o.odds) != null)
  if (usable.length === 0) return null
  for (const pref of preferred) {
    const hit = usable.find((e) => e.id === pref && e.o.available !== false)
    if (hit) return hit
  }
  return usable.find((e) => e.o.isMainLine && e.o.available !== false) ?? usable[0]
}

/**
 * Map one SGO event into a NormalizedEvent. Pure — the unit the tests exercise. Odds are
 * grouped into markets by (type, period, statID, playerID); each odd becomes one
 * selection sourced from the preferred bookmaker. Display price = raw × house margin
 * (the poller overlays any manual override on top when it persists — pricing.applyPricing).
 *
 * // SEAM(alt-lines): SGO returns alternate spreads/totals when includeAltLines=true.
 * Their exact wire shape (separate oddIDs vs. repeated byBookmaker rows) needs live
 * verification; this mapping surfaces whatever distinct (oddID, line) pairs appear as
 * separate selections within the market, which is correct for the separate-oddID case.
 */
export function normalizeEvent(ev: SGOEvent, cfg: SGOProviderConfig = {}): NormalizedEvent {
  const preferred = cfg.bookmakers ?? DEFAULT_BOOKMAKERS
  const margin = cfg.margin ?? DEFAULT_MARGIN
  const home = ev.teams?.home?.names?.medium ?? ev.teams?.home?.names?.short ?? 'Home'
  const away = ev.teams?.away?.names?.medium ?? ev.teams?.away?.names?.short ?? 'Away'

  // group odds → markets
  const groups = new Map<string, { market: NormalizedMarket; sels: Selection[] }>()
  for (const [oddID, odd] of Object.entries(ev.odds ?? {})) {
    const parsed = parseOddId(oddID)
    if (!parsed) continue
    const betTypeID = odd.betTypeID ?? parsed.betTypeID
    const periodID = odd.periodID ?? parsed.periodID
    const statID = odd.statID ?? parsed.statID
    const playerID = odd.playerID
    const type = marketTypeOf(betTypeID, !!playerID)

    const picked = pickBookmaker(odd.byBookmaker, preferred)
    if (!picked) continue
    const american = toAmerican(picked.o.odds)
    if (american == null) continue
    const raw = priceFromAmerican(american)
    const line = type === 'spread' ? toLine(picked.o.spread) : type === 'total' ? toLine(picked.o.overUnder) : undefined

    const sel: Selection = {
      selectionId: line != null ? `${oddID}@${line}` : oddID,
      side: odd.sideID ?? parsed.sideID,
      ...(line != null ? { line } : {}),
      priceRaw: raw,
      priceDisplay: applyMargin(raw, margin),
      bookmaker: picked.id,
      available: picked.o.available !== false && odd.bookOddsAvailable !== false,
    }

    const key = `${type}:${periodID}:${statID}:${playerID ?? ''}`
    let g = groups.get(key)
    if (!g) {
      const marketId = `${ev.eventID}:${type}:${periodID}${type === 'prop' ? `:${statID}:${playerID ?? ''}` : ''}`
      const market: NormalizedMarket = {
        marketId,
        type,
        period: periodID,
        ...(type === 'prop' ? { statId: statID } : {}),
        ...(playerID ? { playerId: playerID } : {}),
        selections: [],
      }
      g = { market, sels: [] }
      groups.set(key, g)
    }
    g.sels.push(sel)
  }

  const markets = [...groups.values()].map(({ market, sels }) => ({ ...market, selections: sels }))
  return {
    eventId: ev.eventID,
    leagueId: ev.leagueID ?? '',
    sport: ev.sportID ?? '',
    home,
    away,
    startsAt: ev.status?.startsAt ?? '',
    status: statusOf(ev.status),
    markets,
  }
}

/* ───────────────────────────── the provider ────────────────────────────── */

export class SGOProvider implements OddsFeedProvider {
  readonly name = 'sgo'
  private readonly cfg: SGOProviderConfig
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly doFetch: typeof fetch

  constructor(cfg: SGOProviderConfig = {}) {
    this.cfg = cfg
    // Never hardcode: read the key from the injected config or the env (server-side).
    this.apiKey = cfg.apiKey ?? readEnv('SPORTS_ODDS_API_KEY_HEADER')
    this.baseUrl = cfg.baseUrl ?? SGO_BASE_URL
    this.doFetch = cfg.fetchImpl ?? globalThis.fetch
  }

  /** True when a key is configured; the poller falls back to the mock when it isn't. */
  get configured(): boolean {
    return this.apiKey.length > 0
  }

  async listEvents(leagueIds: string[], opts: ListEventsOptions = {}): Promise<NormalizedEvent[]> {
    const out: NormalizedEvent[] = []
    let cursor: string | undefined
    // Cursor-paginate, but bounded so a runaway never burns the object budget.
    for (let page = 0; page < 20; page++) {
      const params = new URLSearchParams()
      params.set('oddsAvailable', 'true')
      if (leagueIds.length) params.set('leagueID', leagueIds.join(','))
      if (opts.includeAltLines) params.set('includeAltLines', 'true')
      if (opts.bookmakerIds?.length) params.set('bookmakerID', opts.bookmakerIds.join(','))
      if (opts.oddIds?.length) params.set('oddID', opts.oddIds.join(','))
      if (opts.startsAfter) params.set('startsAfter', opts.startsAfter)
      if (opts.startsBefore) params.set('startsBefore', opts.startsBefore)
      if (opts.limit) params.set('limit', String(opts.limit))
      if (opts.status === 'live') params.set('live', 'true')
      if (cursor) params.set('cursor', cursor)

      const res = await this.request(`${this.baseUrl}/events?${params.toString()}`)
      for (const ev of res.data ?? []) out.push(normalizeEvent(ev, this.cfg))
      if (!res.nextCursor) break
      cursor = res.nextCursor
      if (opts.limit && out.length >= opts.limit) break
    }
    return out
  }

  async getEvent(eventId: string): Promise<NormalizedEvent | null> {
    const params = new URLSearchParams({ eventID: eventId })
    const res = await this.request(`${this.baseUrl}/events?${params.toString()}`)
    const ev = res.data?.[0]
    return ev ? normalizeEvent(ev, this.cfg) : null
  }

  private async request(url: string): Promise<SGOListResponse> {
    const res = await this.doFetch(url, { headers: { 'x-api-key': this.apiKey } })
    if (!res.ok) throw new Error(`SGO ${res.status} ${res.statusText} for ${url}`)
    const json = (await res.json()) as SGOListResponse
    if (json.success === false) throw new Error(`SGO returned success:false for ${url}`)
    return json
  }
}

/** Read an env var without assuming a runtime (Node poller); empty string when absent. */
function readEnv(name: string): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return env?.[name] ?? ''
}
