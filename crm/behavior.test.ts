import { describe, it, expect } from 'vitest'
import {
  deriveBehavior,
  stakeTierOf,
  churnRiskOf,
  type RecordLike,
  type BetLike,
  type BehaviorInput,
} from './behavior.js'
import type { PlayerSignals } from './types.js'

const DAY = 86_400_000

/** Build a RecordLike with sane defaults; override only what a case cares about. */
function rec(over: Partial<RecordLike> = {}): RecordLike {
  return {
    time: 0,
    accountId: 'p1',
    gameKey: 'mines',
    game: 'Mines',
    kind: 'wager',
    stake: 1_000,
    profit: 0,
    multiplier: 1,
    outcome: 'loss',
    ...over,
  }
}

function bet(over: Partial<BetLike> = {}): BetLike {
  return { accountId: 'p1', isParlay: false, isSgp: false, ...over }
}

function signals(over: Partial<PlayerSignals> = {}): PlayerSignals {
  return {
    playerId: 'p1',
    signupAt: 0,
    deviceIds: [],
    ipHashes: [],
    sessions: [],
    ...over,
  }
}

/** Run deriveBehavior for a single member and return that member's features. */
function deriveOne(opts: {
  id?: string
  name?: string
  records: RecordLike[]
  bets?: BetLike[]
  signals?: PlayerSignals
  now: number
}) {
  const id = opts.id ?? 'p1'
  const input: BehaviorInput = {
    members: [{ id, name: opts.name ?? 'Player One' }],
    records: opts.records,
    bets: opts.bets ?? [],
    signals: opts.signals ? new Map([[id, opts.signals]]) : new Map(),
    now: opts.now,
  }
  return deriveBehavior(input)[0]
}

describe('stakeTierOf — threshold boundaries', () => {
  it('returns micro just below the low cut and at zero', () => {
    expect(stakeTierOf(0)).toBe('micro')
    expect(stakeTierOf(499)).toBe('micro')
  })

  it('returns low at exactly $5 (500c) up to just below $20', () => {
    expect(stakeTierOf(500)).toBe('low')
    expect(stakeTierOf(1_999)).toBe('low')
  })

  it('returns mid at exactly $20 (2000c) up to just below $100', () => {
    expect(stakeTierOf(2_000)).toBe('mid')
    expect(stakeTierOf(9_999)).toBe('mid')
  })

  it('returns high at exactly $100 (10000c) up to just below $500', () => {
    expect(stakeTierOf(10_000)).toBe('high')
    expect(stakeTierOf(49_999)).toBe('high')
  })

  it('returns whale at exactly $500 (50000c) and above', () => {
    expect(stakeTierOf(50_000)).toBe('whale')
    expect(stakeTierOf(1_000_000)).toBe('whale')
  })
})

describe('churnRiskOf', () => {
  it('returns exactly 0.5 when the player has never bet', () => {
    expect(churnRiskOf({ recencyDays: 0, activeDays: 0, ageDays: 0, bets: 0 })).toBe(0.5)
    // bets:0 short-circuits regardless of the other inputs
    expect(churnRiskOf({ recencyDays: 999, activeDays: 50, ageDays: 999, bets: 0 })).toBe(0.5)
  })

  it('is monotonic non-decreasing in recencyDays (all else fixed)', () => {
    const base = { activeDays: 4, ageDays: 30, bets: 20 }
    let prev = -1
    for (const recencyDays of [0, 1, 2, 5, 10, 20, 40, 80, 200]) {
      const r = churnRiskOf({ ...base, recencyDays })
      expect(r).toBeGreaterThanOrEqual(prev)
      prev = r
    }
  })

  it('strictly increases over the rising middle of the lapse curve', () => {
    // cadence = ageDays/activeDays = 30/4 = 7.5; lapses = recency/7.5.
    // fromLapse = clamp01((lapses - 0.8)/3.2). recency 12 -> lapses 1.6, 24 -> 3.2:
    // both inside the unclamped band, so more silence => strictly more risk.
    const base = { activeDays: 4, ageDays: 30, bets: 20 }
    const low = churnRiskOf({ ...base, recencyDays: 12 })
    const high = churnRiskOf({ ...base, recencyDays: 24 })
    expect(high).toBeGreaterThan(low)
  })

  it('clamps into [0,1] at both extremes', () => {
    const onSchedule = churnRiskOf({ recencyDays: 0, activeDays: 30, ageDays: 30, bets: 30 })
    expect(onSchedule).toBeGreaterThanOrEqual(0)
    const lapsedHard = churnRiskOf({ recencyDays: 10_000, activeDays: 1, ageDays: 1, bets: 1 })
    expect(lapsedHard).toBeLessThanOrEqual(1)
    expect(lapsedHard).toBeGreaterThanOrEqual(0)
    // recency 10000 with cadence 1 saturates fromLapse to 1; activeDays 1 gives
    // fromFreq = clamp01((6-1)/12) = 5/12. result = 0.7*1 + 0.3*(5/12) = 0.825.
    expect(lapsedHard).toBeCloseTo(0.825, 12)
  })

  it('a low-frequency player is at least as fragile as a high-frequency one (same lapse)', () => {
    // Hold lapses constant by scaling ageDays with activeDays so cadence (=ageDays/activeDays)
    // and recency are identical; only the fromFreq term differs.
    const lowFreq = churnRiskOf({ recencyDays: 5, activeDays: 2, ageDays: 10, bets: 2 })
    const highFreq = churnRiskOf({ recencyDays: 5, activeDays: 10, ageDays: 50, bets: 10 })
    expect(lowFreq).toBeGreaterThanOrEqual(highFreq)
  })
})

describe('deriveBehavior — volume, stake and net', () => {
  it('sums turnover, nets signed profit, averages and medians the stakes', () => {
    // four wagers, stakes 1000, 3000, 500, 2000 -> turnover 6500
    // profits +2000, -3000, +500, -2000 -> net -2500
    const records: RecordLike[] = [
      rec({ time: 1 * DAY, stake: 1_000, profit: 2_000, outcome: 'win' }),
      rec({ time: 2 * DAY, stake: 3_000, profit: -3_000, outcome: 'loss' }),
      rec({ time: 3 * DAY, stake: 500, profit: 500, outcome: 'win' }),
      rec({ time: 4 * DAY, stake: 2_000, profit: -2_000, outcome: 'loss' }),
    ]
    const f = deriveOne({ records, now: 5 * DAY })

    expect(f.bets).toBe(4)
    expect(f.turnoverCents).toBe(6_500)
    expect(f.netCents).toBe(-2_500)
    // avg = round(6500/4) = round(1625) = 1625
    expect(f.avgStakeCents).toBe(1_625)
    // sorted stakes [500,1000,2000,3000]; even length -> round((1000+2000)/2)=1500
    expect(f.medianStakeCents).toBe(1_500)
    expect(f.stakeTier).toBe('low') // 1500 in [500, 2000)
  })

  it('takes the median of an odd count as the middle element', () => {
    const records: RecordLike[] = [
      rec({ time: 1 * DAY, stake: 100 }),
      rec({ time: 2 * DAY, stake: 5_000 }),
      rec({ time: 3 * DAY, stake: 900 }),
    ]
    const f = deriveOne({ records, now: 4 * DAY })
    // sorted [100,900,5000] -> middle 900
    expect(f.medianStakeCents).toBe(900)
    expect(f.stakeTier).toBe('low')
    // avg = round((100+5000+900)/3) = round(2000) = 2000
    expect(f.avgStakeCents).toBe(2_000)
  })

  it('ignores bonus records for volume but counts them as top-ups', () => {
    const records: RecordLike[] = [
      rec({ time: 1 * DAY, stake: 1_000, profit: 100, outcome: 'win' }),
      rec({ time: 1 * DAY, kind: 'bonus', stake: 0, profit: 5_000, outcome: 'bonus' }),
      rec({ time: 2 * DAY, kind: 'bonus', stake: 0, profit: 2_000, outcome: 'bonus' }),
    ]
    const f = deriveOne({ records, now: 3 * DAY })
    expect(f.bets).toBe(1) // only the wager
    expect(f.turnoverCents).toBe(1_000) // bonus stake not counted
    expect(f.netCents).toBe(100) // bonus profit not counted in net
    expect(f.topUps).toBe(2)
  })

  it('zeroes everything for a member with no records', () => {
    const f = deriveOne({ id: 'ghost', name: 'Ghost', records: [], now: 10 * DAY })
    expect(f.bets).toBe(0)
    expect(f.turnoverCents).toBe(0)
    expect(f.netCents).toBe(0)
    expect(f.avgStakeCents).toBe(0)
    expect(f.medianStakeCents).toBe(0)
    expect(f.stakeTier).toBe('micro')
    expect(f.topGameKey).toBe('')
    expect(f.topGameShare).toBe(0)
    expect(f.casinoShare).toBe(0)
    expect(f.sportsbookShare).toBe(0)
    expect(f.winRate).toBe(0)
    expect(f.activeDays).toBe(0)
    expect(f.betsPerActiveDay).toBe(0)
  })
})

describe('deriveBehavior — game preference and product split', () => {
  it('picks the most-played game key and its share, and splits casino vs sportsbook by turnover', () => {
    // mines x3 (stakes 1000 each), crash x1 (2000), sportsbook x1 (5000)
    // turnover = 3000 + 2000 + 5000 = 10000
    // casino turnover = mines 3000 + crash 2000 = 5000; sports = 5000
    const records: RecordLike[] = [
      rec({
        time: 1 * DAY,
        gameKey: 'mines',
        game: 'Mines',
        stake: 1_000,
        outcome: 'win',
        profit: 1,
      }),
      rec({ time: 1 * DAY, gameKey: 'mines', game: 'Mines', stake: 1_000, outcome: 'loss' }),
      rec({ time: 2 * DAY, gameKey: 'mines', game: 'Mines', stake: 1_000, outcome: 'loss' }),
      rec({ time: 2 * DAY, gameKey: 'crash', game: 'Crash', stake: 2_000, outcome: 'loss' }),
      rec({
        time: 3 * DAY,
        gameKey: 'sportsbook',
        game: 'Sportsbook',
        stake: 5_000,
        outcome: 'loss',
      }),
    ]
    const f = deriveOne({ records, now: 4 * DAY })

    expect(f.topGameKey).toBe('mines')
    expect(f.topGameName).toBe('Mines')
    // 3 of 5 bets on mines
    expect(f.topGameShare).toBeCloseTo(3 / 5, 12)
    expect(f.casinoShare).toBeCloseTo(5_000 / 10_000, 12)
    expect(f.sportsbookShare).toBeCloseTo(5_000 / 10_000, 12)
    expect(f.productLean).toBe('mixed') // neither share >= 0.7
  })

  it('leans casino when casino turnover dominates', () => {
    const records: RecordLike[] = [
      rec({ time: 1 * DAY, gameKey: 'mines', game: 'Mines', stake: 8_000 }),
      rec({ time: 2 * DAY, gameKey: 'sportsbook', game: 'Sportsbook', stake: 2_000 }),
    ]
    const f = deriveOne({ records, now: 3 * DAY })
    expect(f.casinoShare).toBeCloseTo(0.8, 12)
    expect(f.productLean).toBe('casino')
  })

  it('leans sportsbook when sportsbook turnover dominates', () => {
    const records: RecordLike[] = [
      rec({ time: 1 * DAY, gameKey: 'sportsbook', game: 'Sportsbook', stake: 9_000 }),
      rec({ time: 2 * DAY, gameKey: 'crash', game: 'Crash', stake: 1_000 }),
    ]
    const f = deriveOne({ records, now: 3 * DAY })
    expect(f.sportsbookShare).toBeCloseTo(0.9, 12)
    expect(f.productLean).toBe('sportsbook')
  })
})

describe('deriveBehavior — sportsbook shape (parlay / sgp)', () => {
  it('computes parlay and sgp shares over the player bets', () => {
    const bets: BetLike[] = [
      bet({ isParlay: false, isSgp: false }),
      bet({ isParlay: true, isSgp: false }),
      bet({ isParlay: true, isSgp: true }),
      bet({ isParlay: false, isSgp: false }),
    ]
    const f = deriveOne({ records: [rec({ time: 1 * DAY })], bets, now: 2 * DAY })
    // 2 of 4 parlays, 1 of 4 sgp
    expect(f.parlayShare).toBeCloseTo(0.5, 12)
    expect(f.sgpShare).toBeCloseTo(0.25, 12)
  })

  it('reports zero shares when the player has no sportsbook bets', () => {
    const f = deriveOne({ records: [rec({ time: 1 * DAY })], bets: [], now: 2 * DAY })
    expect(f.parlayShare).toBe(0)
    expect(f.sgpShare).toBe(0)
  })

  it('does not attribute another player bets to this member', () => {
    const bets: BetLike[] = [bet({ accountId: 'other', isParlay: true, isSgp: true })]
    const f = deriveOne({ id: 'p1', records: [rec({ time: 1 * DAY })], bets, now: 2 * DAY })
    expect(f.parlayShare).toBe(0)
    expect(f.sgpShare).toBe(0)
  })
})

describe('deriveBehavior — cadence, recency and signup', () => {
  it('derives active days, recency and bets/day from the bet timestamps', () => {
    // bets on UTC days 1, 1, 3 (two on the same day) -> 2 distinct active days
    const records: RecordLike[] = [
      rec({ time: 1 * DAY + 1_000 }),
      rec({ time: 1 * DAY + 50_000 }),
      rec({ time: 3 * DAY }),
    ]
    // now = day 10 exactly; last active is day 3
    const f = deriveOne({ records, now: 10 * DAY })
    expect(f.activeDays).toBe(2)
    expect(f.bets).toBe(3)
    expect(f.betsPerActiveDay).toBeCloseTo(3 / 2, 12)
    // firstActive is the min timestamp, lastActive the max
    expect(f.firstActive).toBe(1 * DAY + 1_000)
    expect(f.lastActive).toBe(3 * DAY)
    // recencyDays = floor((now - lastActive)/DAY) = floor((10d - 3d)/DAY) = 7
    expect(f.recencyDays).toBe(7)
  })

  it('uses signals.signupAt for daysSinceSignup', () => {
    // signup at day 2, now at day 12 -> 10 days since signup
    const records: RecordLike[] = [rec({ time: 5 * DAY })]
    const f = deriveOne({
      records,
      signals: signals({ signupAt: 2 * DAY }),
      now: 12 * DAY,
    })
    expect(f.signupAt).toBe(2 * DAY)
    expect(f.daysSinceSignup).toBe(10)
  })

  it('falls back to firstActive for signup when no signals signupAt', () => {
    // no signals provided; signupAt should fall back to firstActive (day 4)
    const records: RecordLike[] = [rec({ time: 4 * DAY }), rec({ time: 6 * DAY })]
    const f = deriveOne({ records, now: 9 * DAY })
    expect(f.signupAt).toBe(4 * DAY)
    expect(f.daysSinceSignup).toBe(5) // floor((9d - 4d)/DAY)
  })

  it('uses daysSinceSignup as recency when the player never bet', () => {
    // no wagers -> lastActive is 0 (falsy), recency falls back to daysSinceSignup
    const f = deriveOne({
      records: [],
      signals: signals({ signupAt: 3 * DAY }),
      now: 11 * DAY,
    })
    expect(f.recencyDays).toBe(8) // = daysSinceSignup = floor((11d-3d)/DAY)
    expect(f.daysSinceSignup).toBe(8)
  })
})

describe('deriveBehavior — win rate and sessions', () => {
  it('win rate is wins over resolved wagers', () => {
    const records: RecordLike[] = [
      rec({ time: 1 * DAY, outcome: 'win' }),
      rec({ time: 2 * DAY, outcome: 'win' }),
      rec({ time: 3 * DAY, outcome: 'loss' }),
      rec({ time: 4 * DAY, outcome: 'push' }),
    ]
    const f = deriveOne({ records, now: 5 * DAY })
    // 2 wins / 4 resolved wagers
    expect(f.winRate).toBeCloseTo(0.5, 12)
  })

  it('summarizes sessions count and average duration from signals', () => {
    const f = deriveOne({
      records: [rec({ time: 1 * DAY })],
      signals: signals({
        signupAt: 0,
        sessions: [
          { at: 1 * DAY, deviceId: 'd1', ipHash: 'i1', durationMin: 10 },
          { at: 2 * DAY, deviceId: 'd1', ipHash: 'i1', durationMin: 21 },
        ],
      }),
      now: 3 * DAY,
    })
    expect(f.sessions).toBe(2)
    // round((10 + 21) / 2) = round(15.5) = 16
    expect(f.avgSessionMin).toBe(16)
  })

  it('reports zero sessions when signals are absent', () => {
    const f = deriveOne({ records: [rec({ time: 1 * DAY })], now: 2 * DAY })
    expect(f.sessions).toBe(0)
    expect(f.avgSessionMin).toBe(0)
  })
})

describe('deriveBehavior — multiple members are partitioned by accountId', () => {
  it('attributes records and bets to the right member only', () => {
    const input: BehaviorInput = {
      members: [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' },
      ],
      records: [
        rec({ accountId: 'a', time: 1 * DAY, stake: 1_000, outcome: 'win', profit: 1_000 }),
        rec({ accountId: 'b', time: 1 * DAY, stake: 60_000, outcome: 'loss', profit: -60_000 }),
        rec({ accountId: 'b', time: 2 * DAY, stake: 60_000, outcome: 'loss', profit: -60_000 }),
      ],
      bets: [bet({ accountId: 'b', isParlay: true, isSgp: false })],
      signals: new Map(),
      now: 5 * DAY,
    }
    const [alice, bob] = deriveBehavior(input)

    expect(alice.playerId).toBe('a')
    expect(alice.name).toBe('Alice')
    expect(alice.bets).toBe(1)
    expect(alice.turnoverCents).toBe(1_000)
    expect(alice.parlayShare).toBe(0)

    expect(bob.playerId).toBe('b')
    expect(bob.bets).toBe(2)
    expect(bob.turnoverCents).toBe(120_000)
    expect(bob.medianStakeCents).toBe(60_000)
    expect(bob.stakeTier).toBe('whale')
    expect(bob.parlayShare).toBe(1)
  })
})
