/**
 * Deterministic demo dataset for the CRM/analytics surfaces. The live analytics
 * feed is empty on a fresh load (session-only ledger), so this synthesizes a
 * believable, VARIED betting history over the REAL roster — whales, sharps, parlay
 * chasers, grinders, casual, dormant, brand-new — so segments, risk flags and every
 * chart render fully populated in the demo.
 *
 * PURELY READ-ONLY: it returns in-memory data the CRM functions consume. It never
 * touches core, the ledger, balances, or any store — no money path. Deterministic
 * (hash-seeded, `now` injected) so renders + tests are stable.
 */

import type { PlayerSignals } from './types.js'
import { hash32 } from './signals.js'

const DAY = 86_400_000

function rnd(seed: string, key: string): number {
  return hash32(`${seed}:${key}`) / 0xffffffff
}
const pick = <T>(seed: string, key: string, xs: T[]): T =>
  xs[Math.floor(rnd(seed, key) * xs.length)]
const between = (seed: string, key: string, lo: number, hi: number): number =>
  lo + rnd(seed, key) * (hi - lo)

/** A resolved analytics record (structurally AnalyticsRecord / AnRecord). */
export interface SeedRecord {
  time: number
  accountId: string
  gameKey: string
  game: string
  kind: 'wager' | 'bonus'
  stake: number
  profit: number
  multiplier: number
  outcome: string
}

/** A sportsbook bet (structural subset of app/book BookBet + its legs). */
export interface SeedLeg {
  leagueId: string
  marketType: 'moneyline' | 'spread' | 'total' | 'prop'
  sport: string
  eventId: string
  price: { decimal: number }
  trueProb: number
}
export interface SeedBet {
  accountId: string
  mode: 'single' | 'parlay'
  legs: SeedLeg[]
  stakeCents: number
  status: 'open' | 'won' | 'lost' | 'push' | 'void' | 'cashed'
  returnCents?: number
  cashedOutCents?: number
  placedAt: number
  settledAt?: number
}

type Archetype = 'whale' | 'sharp' | 'parlay' | 'grinder' | 'casual' | 'dormant' | 'new'
const ARCHETYPES: Archetype[] = ['whale', 'sharp', 'parlay', 'grinder', 'casual', 'dormant', 'new']

const CASINO_GAMES: [string, string][] = [
  ['mines', 'Mines'],
  ['crash', 'Crash'],
  ['dice', 'Dice'],
  ['slots', 'Slots'],
  ['blackjack', 'Blackjack'],
  ['plinko', 'Plinko'],
]
const SPORTS: [string, string][] = [
  ['BASKETBALL', 'NBA'],
  ['FOOTBALL', 'NFL'],
  ['BASEBALL', 'MLB'],
  ['HOCKEY', 'NHL'],
  ['SOCCER', 'EPL'],
]
const MARKETS: SeedLeg['marketType'][] = ['moneyline', 'spread', 'total', 'prop']

/** Pick an archetype for a player, evenly spread so a small roster still covers the set. */
export function archetypeOf(playerId: string, index: number): Archetype {
  // index-based spread guarantees variety across the first 7 players; hash for the rest
  if (index < ARCHETYPES.length) return ARCHETYPES[index]
  return ARCHETYPES[hash32(playerId) % ARCHETYPES.length]
}

interface Shape {
  count: number
  stakeLo: number
  stakeHi: number
  winRate: number
  sports: boolean
  recentMaxDays: number
  recentMinDays: number
}

function shapeFor(a: Archetype): Shape {
  switch (a) {
    case 'whale':
      return {
        count: 28,
        stakeLo: 20_000,
        stakeHi: 90_000,
        winRate: 0.47,
        sports: false,
        recentMinDays: 0,
        recentMaxDays: 6,
      }
    case 'sharp':
      return {
        count: 44,
        stakeLo: 3_000,
        stakeHi: 12_000,
        winRate: 0.58,
        sports: true,
        recentMinDays: 0,
        recentMaxDays: 5,
      }
    case 'parlay':
      return {
        count: 30,
        stakeLo: 500,
        stakeHi: 4_000,
        winRate: 0.22,
        sports: true,
        recentMinDays: 0,
        recentMaxDays: 8,
      }
    case 'grinder':
      return {
        count: 90,
        stakeLo: 100,
        stakeHi: 400,
        winRate: 0.49,
        sports: false,
        recentMinDays: 0,
        recentMaxDays: 4,
      }
    case 'casual':
      return {
        count: 12,
        stakeLo: 1_000,
        stakeHi: 5_000,
        winRate: 0.45,
        sports: false,
        recentMinDays: 1,
        recentMaxDays: 12,
      }
    case 'dormant':
      return {
        count: 14,
        stakeLo: 800,
        stakeHi: 6_000,
        winRate: 0.44,
        sports: false,
        recentMinDays: 28,
        recentMaxDays: 60,
      }
    case 'new':
      return {
        count: 3,
        stakeLo: 500,
        stakeHi: 3_000,
        winRate: 0.5,
        sports: false,
        recentMinDays: 0,
        recentMaxDays: 5,
      }
  }
}

/** Build the full demo dataset for a roster. Deterministic given (players, signals, now). */
export function seedDataset(
  players: { id: string; name: string }[],
  signals: Map<string, PlayerSignals>,
  now: number,
): { records: SeedRecord[]; bets: SeedBet[] } {
  const records: SeedRecord[] = []
  const bets: SeedBet[] = []

  players.forEach((p, idx) => {
    const a = archetypeOf(p.id, idx)
    const sh = shapeFor(a)
    const sig = signals.get(p.id)
    const signupAt = sig?.signupAt ?? now - 60 * DAY
    // window of activity: between signup and the archetype's recency band
    const lastDaysAgo =
      sh.recentMinDays + Math.floor(rnd(p.id, 'last') * (sh.recentMaxDays - sh.recentMinDays + 1))
    const spanStart = Math.max(signupAt, now - (sh.recentMaxDays + 25) * DAY)
    const spanEnd = now - lastDaysAgo * DAY

    // a few top-ups (bonus grants) for some archetypes — the no-cash "top-up" proxy
    const topUps =
      a === 'grinder' || a === 'parlay'
        ? 1 + Math.floor(rnd(p.id, 'tu') * 4)
        : rnd(p.id, 'tu') > 0.7
          ? 1
          : 0
    for (let t = 0; t < topUps; t++) {
      records.push({
        time: Math.round(between(p.id, `tut${t}`, spanStart, spanEnd)),
        accountId: p.id,
        gameKey: 'bonus',
        game: 'Bonus',
        kind: 'bonus',
        stake: 0,
        profit: pick(p.id, `tuc${t}`, [2_500, 5_000, 10_000]),
        multiplier: 1,
        outcome: 'win',
      })
    }

    for (let i = 0; i < sh.count; i++) {
      const time = Math.round(between(p.id, `t${i}`, spanStart, spanEnd))
      const stake = Math.round(between(p.id, `s${i}`, sh.stakeLo, sh.stakeHi) / 50) * 50
      const won = rnd(p.id, `w${i}`) < sh.winRate

      if (sh.sports) {
        // sportsbook bet (+ its derived record)
        const isParlay = a === 'parlay' ? rnd(p.id, `p${i}`) < 0.8 : rnd(p.id, `p${i}`) < 0.18
        const legCount = isParlay ? 2 + Math.floor(rnd(p.id, `lc${i}`) * 3) : 1
        const sameGame = isParlay && rnd(p.id, `sg${i}`) < 0.4
        const [sport, league] = pick(p.id, `sp${i}`, SPORTS)
        const evt = `evt_${hash32(p.id + i).toString(36)}`
        const legs: SeedLeg[] = []
        let comboDecimal = 1
        for (let l = 0; l < legCount; l++) {
          const [lsport, lleague] = sameGame ? [sport, league] : pick(p.id, `sp${i}_${l}`, SPORTS)
          const decimal = +between(p.id, `d${i}_${l}`, 1.5, a === 'parlay' ? 3.2 : 2.2).toFixed(2)
          // a sharp consistently takes a price implying MORE value than its true prob
          const fairProb = 1 / decimal
          const edge =
            a === 'sharp'
              ? between(p.id, `e${i}_${l}`, 0.0, 0.09)
              : between(p.id, `e${i}_${l}`, -0.06, 0.0)
          const trueProb = Math.min(0.92, Math.max(0.04, fairProb * (1 + edge)))
          legs.push({
            leagueId: lleague,
            marketType: pick(p.id, `mk${i}_${l}`, MARKETS),
            sport: lsport,
            eventId: sameGame ? evt : `evt_${hash32(p.id + i + 'x' + l).toString(36)}`,
            price: { decimal },
            trueProb: +trueProb.toFixed(4),
          })
          comboDecimal *= decimal
        }
        const decimal = +comboDecimal.toFixed(2)
        const ret = won ? Math.round(stake * decimal) : 0
        const profit = won ? ret - stake : -stake
        bets.push({
          accountId: p.id,
          mode: isParlay ? 'parlay' : 'single',
          legs,
          stakeCents: stake,
          status: won ? 'won' : 'lost',
          returnCents: ret,
          placedAt: time - 3_600_000,
          settledAt: time,
        })
        records.push({
          time,
          accountId: p.id,
          gameKey: 'sportsbook',
          game: 'Sportsbook',
          kind: 'wager',
          stake,
          profit,
          multiplier: won ? decimal : 0,
          outcome: won ? 'win' : 'loss',
        })
      } else {
        // casino bet
        const [gk, gn] = pick(p.id, `g${i}`, CASINO_GAMES)
        const mult = won ? +between(p.id, `m${i}`, 1.2, 6).toFixed(2) : 0
        const profit = won ? Math.round(stake * (mult - 1)) : -stake
        records.push({
          time,
          accountId: p.id,
          gameKey: gk,
          game: gn,
          kind: 'wager',
          stake,
          profit,
          multiplier: mult,
          outcome: won ? 'win' : 'loss',
        })
      }
    }
  })

  records.sort((a, b) => a.time - b.time)
  return { records, bets }
}
