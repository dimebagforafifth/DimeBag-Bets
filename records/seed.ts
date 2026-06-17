/**
 * Deterministic demo histories so every profile renders fully populated in the demo.
 *
 * These are clearly-labelled DEMO fixtures, NOT writes to the money ledger — the record
 * engine treats a seeded BetRow exactly like a real settled one, proving it works on real
 * data while giving a populated demo. In a real, keyed deployment the seed is off and records
 * derive purely from the server ledger (the store gates this; integrity.demoSeeded flags it).
 *
 * Fully deterministic (a per-account PRNG + offsets from a passed `now`) so records, badges,
 * and fingerprints are stable and testable. No Math.random / Date.now here.
 */

import type { BetRow, ClvDatum } from './types.js'

interface SeedProfile {
  accountId: string
  /** Roughly how many settled bets to fabricate. */
  bets: number
  /** Target win rate (drives sign of net/ROI). */
  winRate: number
  stake: [number, number] // cents
  winMult: [number, number]
  /** Fraction of bets that are sportsbook (vs casino). */
  sportsShare: number
  /** One forced big-multiplier win, if set. */
  bigHit?: { mult: number; key: string; name: string }
  /** Closing-line datapoints + target beat rate (0 → no CLV, gated as unavailable). */
  clvBets: number
  clvBeatRate: number
  /** Days the history spreads back over. */
  spanDays: number
}

const CASINO: { key: string; name: string }[] = [
  { key: 'crash', name: 'Crash' },
  { key: 'mines', name: 'Mines' },
  { key: 'dice', name: 'Dice' },
  { key: 'limbo', name: 'Limbo' },
  { key: 'plinko', name: 'Plinko' },
  { key: 'blackjack', name: 'Blackjack' },
  { key: 'roulette', name: 'Roulette' },
  { key: 'keno', name: 'Keno' },
]
const SPORTS = { key: 'sportsbook', name: 'Sportsbook' }

/** Varied, recognisable demo records keyed to the seeded org players (app/book-store seed). */
const PROFILES: SeedProfile[] = [
  // Marco — losing casino grinder, ends on a cold run.
  {
    accountId: 'p-marco',
    bets: 64,
    winRate: 0.42,
    stake: [500, 4000],
    winMult: [1.4, 2.6],
    sportsShare: 0.1,
    clvBets: 0,
    clvBeatRate: 0,
    spanDays: 40,
  },
  // Lena — solid all-rounder in the green, riding a hot streak, one big Crash hit.
  {
    accountId: 'p-lena',
    bets: 52,
    winRate: 0.57,
    stake: [1000, 6000],
    winMult: [1.6, 3.2],
    sportsShare: 0.35,
    bigHit: { mult: 24, key: 'crash', name: 'Crash' },
    clvBets: 18,
    clvBeatRate: 0.5,
    spanDays: 35,
  },
  // Tariq — high-volume, high-variance whale-ish swings, biggest single loss on the book.
  {
    accountId: 'p-tariq',
    bets: 148,
    winRate: 0.48,
    stake: [2000, 18000],
    winMult: [1.5, 3.5],
    sportsShare: 0.25,
    bigHit: { mult: 41, key: 'limbo', name: 'Limbo' },
    clvBets: 22,
    clvBeatRate: 0.41,
    spanDays: 45,
  },
  // Priya — disciplined sharp sports bettor; modest ROI, strong CLV.
  {
    accountId: 'p-priya',
    bets: 58,
    winRate: 0.53,
    stake: [1500, 5000],
    winMult: [1.7, 2.4],
    sportsShare: 0.85,
    clvBets: 40,
    clvBeatRate: 0.64,
    spanDays: 38,
  },
  // Dana (VIP) — the whale: huge lifetime wagered (diamond tier), net positive, sharp CLV.
  {
    accountId: 'p-dana',
    bets: 132,
    winRate: 0.55,
    stake: [20000, 120000],
    winMult: [1.5, 3.0],
    sportsShare: 0.5,
    bigHit: { mult: 33, key: 'crash', name: 'Crash' },
    clvBets: 50,
    clvBeatRate: 0.6,
    spanDays: 45,
  },
]

const PROFILE_BY_ID = new Map(PROFILES.map((p) => [p.accountId, p]))

/** xfnv1a string hash → 32-bit seed. */
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 PRNG — deterministic float stream in [0,1). */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const lerp = (r: number, lo: number, hi: number) => Math.round(lo + r * (hi - lo))

/** True if this account has a seeded demo history. */
export function hasSeed(accountId: string): boolean {
  return PROFILE_BY_ID.has(accountId)
}

/** All seeded demo account ids (for enumerating demo profiles). */
export function seededAccountIds(): string[] {
  return PROFILES.map((p) => p.accountId)
}

/** Deterministic settled-bet history for a seeded account (empty for non-demo accounts). */
export function seededRows(accountId: string, now: number): BetRow[] {
  const p = PROFILE_BY_ID.get(accountId)
  if (!p) return []
  const rand = rng(hashSeed(`${accountId}:rows`))
  const spanMs = p.spanDays * 24 * 60 * 60 * 1000
  const idBase = 9_000_000 + (hashSeed(accountId) % 1000) * 1000
  const rows: BetRow[] = []

  for (let i = 0; i < p.bets; i++) {
    const isSports = rand() < p.sportsShare
    const g = isSports ? SPORTS : CASINO[Math.floor(rand() * CASINO.length)]
    const stake = lerp(rand(), p.stake[0], p.stake[1])
    // Bias the most recent few bets toward the player's streak flavour so "current streak"
    // reads intentionally (Marco cold, Lena/Dana hot). i closer to bets-1 = more recent.
    const recencyBoost = i >= p.bets - 4 ? (p.winRate >= 0.5 ? 0.25 : -0.25) : 0
    const won = rand() < p.winRate + recencyBoost
    const time = Math.round(now - rand() * spanMs)

    if (won) {
      const m = +(p.winMult[0] + rand() * (p.winMult[1] - p.winMult[0])).toFixed(2)
      rows.push({
        id: idBase + i,
        accountId,
        gameKey: g.key,
        game: g.name,
        stake,
        multiplier: m,
        profit: Math.round(stake * (m - 1)),
        outcome: 'win',
        time,
      })
    } else if (rand() < 0.05) {
      // occasional push/void — no action, stake returned
      rows.push({
        id: idBase + i,
        accountId,
        gameKey: g.key,
        game: g.name,
        stake,
        multiplier: 1,
        profit: 0,
        outcome: rand() < 0.5 ? 'push' : 'void',
        time,
      })
    } else {
      rows.push({
        id: idBase + i,
        accountId,
        gameKey: g.key,
        game: g.name,
        stake,
        multiplier: 0,
        profit: -stake,
        outcome: 'loss',
        time,
      })
    }
  }

  if (p.bigHit) {
    const stake = lerp(rand(), p.stake[0], p.stake[1])
    rows.push({
      id: idBase + p.bets,
      accountId,
      gameKey: p.bigHit.key,
      game: p.bigHit.name,
      stake,
      multiplier: p.bigHit.mult,
      profit: Math.round(stake * (p.bigHit.mult - 1)),
      outcome: 'win',
      time: Math.round(now - rand() * spanMs),
    })
  }

  return rows
}

/** Deterministic closing-line datapoints for a seeded account (empty if the profile has none). */
export function seededClv(accountId: string, now: number): ClvDatum[] {
  const p = PROFILE_BY_ID.get(accountId)
  if (!p || p.clvBets === 0) return []
  const rand = rng(hashSeed(`${accountId}:clv`))
  const spanMs = p.spanDays * 24 * 60 * 60 * 1000
  const data: ClvDatum[] = []
  for (let i = 0; i < p.clvBets; i++) {
    const betDecimal = +(1.7 + rand() * 0.7).toFixed(2) // 1.70 .. 2.40
    const beat = rand() < p.clvBeatRate
    const delta = 0.01 + rand() * 0.07 // 1% .. 8% off the close
    // closeFairProb so that closeFairProb*betDecimal = 1 ± delta (beat ⇒ > 1)
    const target = beat ? 1 + delta : 1 - delta
    const closeFairProb = Math.min(0.98, Math.max(0.02, target / betDecimal))
    data.push({ accountId, betDecimal, closeFairProb, time: Math.round(now - rand() * spanMs) })
  }
  return data
}
