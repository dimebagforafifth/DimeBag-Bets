/**
 * CRM data layer — joins the live app stores (org, durable analytics feed,
 * sportsbook bets, VIP) with the synthesized integrity signals, and assembles the
 * CrmProfile[] + operator analytics the console panels render. READ-ONLY: it only
 * observes; it never mutates a store, a balance, or the ledger.
 *
 * When the live analytics feed is still thin (a fresh session — the on-screen
 * ledger is session-only), it falls back to the deterministic demo seed so every
 * surface renders fully populated. Once real play accumulates, the live feed drives.
 */

import { listPlayers, getBook, subscribeBook, getBookVersion } from '../app/book-store.js'
import { agentOf } from '../org/index.js'
import {
  getAnalyticsRecords,
  subscribeAnalytics,
  analyticsVersion,
} from '../manager/reporting/index.js'
import { getBets, subscribeBets, getBetsVersion } from '../app/book/index.js'
import { getPlayerVip, getVipConfig, subscribeVip, getVipVersion } from '../app/vip-store.js'
import { rankFor } from '../vip/index.js'
import { synthSignals } from './signals.js'
import { seedDataset } from './seed.js'
import { deriveBehavior, type BetLike, type RecordLike } from './behavior.js'
import { classifySegment } from './segments.js'
import { scoreRisk, type RiskBet, type RiskLeg } from './risk.js'
import { detectAbuse, flagsForPlayer } from './abuse.js'
import {
  cohortRetention,
  figureTrend,
  holdBySport,
  netMarginPct,
  parlayMix,
  perActiveMember,
  type AnBet,
  type AnRecord,
} from '../analytics/metrics.js'
import type { CrmProfile, PlayerSignals } from './types.js'

/** Below this many live analytics records a fresh session uses the demo seed instead. */
export const LIVE_MIN_RECORDS = 12
/** Below this many live sportsbook bets, the bet-derived surfaces use the seed —
 *  gated SEPARATELY from records, since casino play can fill the record feed while
 *  the (session-only) bets store is still empty, which would blank hold-by-sport. */
export const LIVE_MIN_BETS = 6

/** A bet shape both the live BookBet and the SeedBet satisfy (the fields we read). */
interface RawLeg {
  leagueId?: string
  marketType?: string
  sport?: string
  eventId?: string
  price?: { decimal?: number }
  trueProb?: number
}
interface RawBet {
  accountId: string
  mode: 'single' | 'parlay'
  legs: RawLeg[]
  stakeCents: number
  status: string
  returnCents?: number
  cashedOutCents?: number
}

const isSgp = (b: RawBet): boolean =>
  b.mode === 'parlay' && b.legs.length > 1 && new Set(b.legs.map((l) => l.eventId)).size === 1

function toBetLike(b: RawBet): BetLike {
  return { accountId: b.accountId, isParlay: b.mode === 'parlay', isSgp: isSgp(b) }
}
function toRiskBet(b: RawBet): RiskBet {
  const settled = b.status !== 'open'
  return {
    isParlay: b.mode === 'parlay',
    settled,
    won: b.status === 'won' || b.status === 'cashed',
    pushed: b.status === 'push' || b.status === 'void',
    legs: b.legs.map(
      (l): RiskLeg => ({
        marketType: l.marketType ?? 'moneyline',
        decimal: l.price?.decimal ?? 1,
        trueProb: l.trueProb,
      }),
    ),
  }
}
function toAnBet(b: RawBet): AnBet {
  return {
    accountId: b.accountId,
    mode: b.mode,
    sgp: isSgp(b),
    legs: b.legs.length,
    sports: [...new Set(b.legs.map((l) => l.sport).filter((s): s is string => !!s))],
    leagues: [...new Set(b.legs.map((l) => l.leagueId).filter((s): s is string => !!s))],
    stakeCents: b.stakeCents,
    status: b.status as AnBet['status'],
    returnCents: b.returnCents,
    cashedOutCents: b.cashedOutCents,
  }
}

export interface CrmDataset {
  members: { id: string; name: string }[]
  records: AnRecord[]
  rawBets: RawBet[]
  signals: Map<string, PlayerSignals>
  seeded: boolean
}

/** Assemble the working dataset. Records and bets are gated INDEPENDENTLY: either
 *  source falls back to the deterministic seed while it's still thin, so a fresh
 *  session never shows a half-empty surface (e.g. live casino records but no
 *  sportsbook bets yet). `seeded` is true if EITHER source is seeded. */
export function getCrmDataset(now: number): CrmDataset {
  const players = listPlayers().filter((p) => p.role === 'player')
  const members = players.map((p) => ({ id: p.id, name: p.profile?.nickname || p.name }))
  const signals = synthSignals(members, now)

  const liveRecords = getAnalyticsRecords() as AnRecord[]
  const liveBets = getBets() as unknown as RawBet[]
  const recordsThin = liveRecords.length < LIVE_MIN_RECORDS
  const betsThin = liveBets.length < LIVE_MIN_BETS
  if (!recordsThin && !betsThin) {
    return { members, records: liveRecords, rawBets: liveBets, signals, seeded: false }
  }
  const seed = seedDataset(members, signals, now)
  return {
    members,
    records: recordsThin ? seed.records : liveRecords,
    rawBets: betsThin ? (seed.bets as unknown as RawBet[]) : liveBets,
    signals,
    seeded: recordsThin || betsThin,
  }
}

function isVip(playerId: string): boolean {
  const vip = getPlayerVip(playerId)
  return rankFor(vip.wagered, getVipConfig()).id !== 'none'
}

/** Build the full CRM profile for every player. */
export function buildCrmProfiles(now: number): { profiles: CrmProfile[]; seeded: boolean } {
  const ds = getCrmDataset(now)
  const book = getBook()
  const behavior = deriveBehavior({
    members: ds.members,
    records: ds.records as RecordLike[],
    bets: ds.rawBets.map(toBetLike),
    signals: ds.signals,
    now,
  })
  const abuse = detectAbuse(ds.signals, behavior)

  // index risk bets by player
  const riskBy = new Map<string, RiskBet[]>()
  for (const b of ds.rawBets) {
    const list = riskBy.get(b.accountId) ?? []
    list.push(toRiskBet(b))
    riskBy.set(b.accountId, list)
  }

  const byId = new Map(behavior.map((b) => [b.playerId, b]))
  const profiles: CrmProfile[] = ds.members.map((m) => {
    const b = byId.get(m.id)!
    const member = book.members[m.id]
    return {
      player: {
        id: m.id,
        name: m.name,
        role: member?.role ?? 'player',
        agentId: member ? (agentOf(book, m.id)?.id ?? null) : null,
      },
      behavior: b,
      segment: classifySegment(b, isVip(m.id)),
      risk: scoreRisk(b, riskBy.get(m.id) ?? []),
      abuseFlags: flagsForPlayer(abuse, m.id),
    }
  })
  return { profiles, seeded: ds.seeded }
}

export interface OperatorAnalytics {
  seeded: boolean
  holdBySport: ReturnType<typeof holdBySport>
  parlayMix: ReturnType<typeof parlayMix>
  figureTrend: ReturnType<typeof figureTrend>
  cohorts: ReturnType<typeof cohortRetention>
  perActiveMember: ReturnType<typeof perActiveMember>
  netMarginPct: number
}

/** Build the operator analytics suite. */
export function buildOperatorAnalytics(now: number, windowDays = 30): OperatorAnalytics {
  const ds = getCrmDataset(now)
  const anBets = ds.rawBets.map(toAnBet)
  const signups = [...ds.signals.values()].map((s) => ({ id: s.playerId, signupAt: s.signupAt }))
  return {
    seeded: ds.seeded,
    holdBySport: holdBySport(anBets),
    parlayMix: parlayMix(anBets),
    figureTrend: figureTrend(ds.records, now, windowDays),
    cohorts: cohortRetention(signups, ds.records, now, { periodDays: 7, periods: 4 }),
    perActiveMember: perActiveMember(ds.records, now, 7),
    netMarginPct: netMarginPct(ds.records),
  }
}

/** Reactivity for the panels — re-render when the book, the analytics feed, the
 *  sportsbook bets, or the VIP program change. */
export function subscribeCrm(listener: () => void): () => void {
  const unsubs = [
    subscribeBook(listener),
    subscribeAnalytics(listener),
    subscribeBets(listener),
    subscribeVip(listener),
  ]
  return () => unsubs.forEach((u) => u())
}
export function crmVersion(): number {
  return getBookVersion() + analyticsVersion() + getBetsVersion() + getVipVersion()
}

/** Abuse clusters across the whole book (for the Abuse Watch panel). */
export function buildAbuseClusters(now: number) {
  const ds = getCrmDataset(now)
  const behavior = deriveBehavior({
    members: ds.members,
    records: ds.records as RecordLike[],
    bets: ds.rawBets.map(toBetLike),
    signals: ds.signals,
    now,
  })
  return detectAbuse(ds.signals, behavior)
}
