import { describe, it, expect } from 'vitest'
import type { BehaviorFeatures } from './types.js'
import { scoreRisk, bandOf, marketWinRates, type RiskBet, type RiskLeg } from './risk.js'

/**
 * A minimal, fully-populated BehaviorFeatures stub. Only `playerId`, `bets`, and
 * `winRate` matter to scoreRisk; the rest are filled with neutral, valid values
 * so the object satisfies the type without leaking into the risk math. Tests
 * override `bets` / `winRate` per scenario.
 */
function behavior(overrides: Partial<BehaviorFeatures> = {}): BehaviorFeatures {
  return {
    playerId: 'p1',
    name: 'Test Player',
    bets: 30,
    turnoverCents: 300000,
    netCents: 0,
    avgStakeCents: 10000,
    medianStakeCents: 10000,
    stakeTier: 'mid',
    topGameKey: '',
    topGameName: '',
    topGameShare: 0,
    casinoShare: 0,
    sportsbookShare: 1,
    productLean: 'sportsbook',
    parlayShare: 0,
    sgpShare: 0,
    signupAt: 0,
    daysSinceSignup: 60,
    firstActive: 0,
    lastActive: 0,
    recencyDays: 1,
    activeDays: 20,
    betsPerActiveDay: 1.5,
    topUps: 0,
    sessions: 20,
    avgSessionMin: 30,
    winRate: 0.5,
    churnRisk: 0.2,
    ...overrides,
  }
}

/** A settled single bet on `marketType`, with an optional priced leg. */
function single(marketType: string, won: boolean, decimal = 2, trueProb?: number): RiskBet {
  const leg: RiskLeg = { marketType, decimal, ...(trueProb !== undefined ? { trueProb } : {}) }
  return { isParlay: false, settled: true, won, legs: [leg] }
}

/** N copies of the same priced single bet. */
function repeat(n: number, make: (i: number) => RiskBet): RiskBet[] {
  return Array.from({ length: n }, (_, i) => make(i))
}

describe('bandOf — threshold edges', () => {
  it('partitions [0,100] at 25 / 50 / 75', () => {
    expect(bandOf(0)).toBe('clean')
    expect(bandOf(24)).toBe('clean')
    expect(bandOf(25)).toBe('watch') // >= 25
    expect(bandOf(49)).toBe('watch')
    expect(bandOf(50)).toBe('sharp') // >= 50
    expect(bandOf(74)).toBe('sharp')
    expect(bandOf(75)).toBe('flagged') // >= 75
    expect(bandOf(100)).toBe('flagged')
  })
})

describe('marketWinRates — groups SINGLE settled bets by market', () => {
  it('counts wins per market and sorts by volume desc', () => {
    const bets: RiskBet[] = [
      single('moneyline', true),
      single('moneyline', true),
      single('moneyline', false),
      single('moneyline', false), // moneyline: 4 bets, 2 wins => 0.5
      single('spread', true),
      single('spread', false), // spread: 2 bets, 1 win => 0.5
      single('total', true), // total: 1 bet, 1 win => 1.0
    ]
    const out = marketWinRates(bets)
    // sorted by bets desc: moneyline(4) > spread(2) > total(1)
    expect(out.map((m) => m.market)).toEqual(['moneyline', 'spread', 'total'])
    expect(out[0]).toEqual({ market: 'moneyline', bets: 4, winRate: 0.5 })
    expect(out[1]).toEqual({ market: 'spread', bets: 2, winRate: 0.5 })
    expect(out[2]).toEqual({ market: 'total', bets: 1, winRate: 1 })
  })

  it('excludes parlays, unsettled, and multi-leg bets', () => {
    const bets: RiskBet[] = [
      single('moneyline', true), // counts
      { isParlay: true, settled: true, won: true, legs: [{ marketType: 'moneyline', decimal: 2 }] }, // parlay -> skip
      {
        isParlay: false,
        settled: false,
        won: false,
        legs: [{ marketType: 'moneyline', decimal: 2 }],
      }, // unsettled -> skip
      {
        isParlay: false,
        settled: true,
        won: true,
        legs: [
          { marketType: 'moneyline', decimal: 2 },
          { marketType: 'spread', decimal: 2 },
        ],
      }, // 2 legs -> skip
    ]
    const out = marketWinRates(bets)
    expect(out).toEqual([{ market: 'moneyline', bets: 1, winRate: 1 }])
  })

  it('returns [] when there are no qualifying singles', () => {
    expect(marketWinRates([])).toEqual([])
    expect(marketWinRates([{ isParlay: true, settled: true, won: true, legs: [] }])).toEqual([])
  })
})

describe('scoreRisk — clvEdgePct sign tracks leg value edge', () => {
  it('is positive for +EV legs (decimal*trueProb > 1)', () => {
    // decimal 2.0 * trueProb 0.55 = 1.10 => edge +0.10 => +10%
    const bets = repeat(30, () => single('moneyline', true, 2.0, 0.55))
    const r = scoreRisk(behavior({ bets: 30, winRate: 0.55 }), bets)
    expect(r.clvEdgePct).toBeCloseTo(10, 10)
  })

  it('is negative for -EV legs (decimal*trueProb < 1)', () => {
    // decimal 1.8 * trueProb 0.5 = 0.90 => edge -0.10 => -10%
    const bets = repeat(30, () => single('moneyline', false, 1.8, 0.5))
    const r = scoreRisk(behavior({ bets: 30, winRate: 0.4 }), bets)
    expect(r.clvEdgePct).toBeCloseTo(-10, 10)
  })

  it('averages mixed edges and ignores legs without a trueProb', () => {
    // priced legs: edge +0.10 and edge -0.04 => avg +0.03 => +3%
    const bets: RiskBet[] = [
      single('moneyline', true, 2.0, 0.55), // 1.10 - 1 = +0.10
      single('spread', false, 1.6, 0.6), // 0.96 - 1 = -0.04
      single('total', true, 3.0), // no trueProb -> excluded from edges
    ]
    const r = scoreRisk(behavior({ bets: 3, winRate: 0.5 }), bets)
    expect(r.clvEdgePct).toBeCloseTo(3, 10)
  })
})

describe('scoreRisk — SHARP outscores SQUARE', () => {
  // SHARP: 30 priced +EV single bets, ALL won (realized 100% vs implied 55%).
  //   edge each = 2.0*0.55 - 1 = +0.10  => clvEdge 0.10, clvEdgePct 10
  //   realizedWin 1.0 vs impliedWin 0.55 (priced singles) => overperf +0.45
  //   posShare 1                        => lineTimingScore 1, timingPts 25
  //   confidence = 30/30 = 1
  //   clvPts  = clamp(0.10*600=60,-20,55) = 55
  //   overPts = clamp(0.45*180=81,-15,30) = 30 (capped)
  //   timingPts = 25
  //   raw = clamp(55+30+25=110,0,100) = 100 ; score = round(100*1) = 100
  const sharpBets = repeat(30, () => single('moneyline', true, 2.0, 0.55))
  const sharp = scoreRisk(behavior({ bets: 30, winRate: 0.65 }), sharpBets)

  // SQUARE: 30 priced -EV legs, low win-rate.
  //   edge each = 1.8*0.5 - 1 = -0.10   => clvEdge -0.10, clvEdgePct -10
  //   impliedWin = 0.5, winRate 0.35    => overperf -0.15
  //   posShare 0                        => lineTimingScore 0, timingPts 0
  //   confidence = 1
  //   clvPts  = clamp(-0.10*600=-60,-20,55) = -20
  //   overPts = clamp(-0.15*180=-27,-15,30) = -15
  //   raw = clamp(-20-15+0=-35,0,100) = 0 ; score = 0
  const squareBets = repeat(30, () => single('moneyline', false, 1.8, 0.5))
  const square = scoreRisk(behavior({ bets: 30, winRate: 0.35 }), squareBets)

  it('computes the sharp score exactly (100, flagged)', () => {
    expect(sharp.clvEdgePct).toBeCloseTo(10, 10)
    expect(sharp.lineTimingScore).toBe(1)
    expect(sharp.score).toBe(100)
    expect(sharp.band).toBe('flagged')
  })

  it('computes the square score exactly (0, clean)', () => {
    expect(square.clvEdgePct).toBeCloseTo(-10, 10)
    expect(square.lineTimingScore).toBe(0)
    expect(square.score).toBe(0)
    expect(square.band).toBe('clean')
  })

  it('the sharp scores and bands strictly above the square', () => {
    expect(sharp.score).toBeGreaterThan(square.score)
    const order = { clean: 0, watch: 1, sharp: 2, flagged: 3 } as const
    expect(order[sharp.band]).toBeGreaterThan(order[square.band])
  })

  it('surfaces populated reasons for the sharp', () => {
    const codes = sharp.reasons.map((x) => x.code)
    expect(sharp.reasons.length).toBeGreaterThan(0)
    expect(codes).toContain('clv-positive') // clvEdgePct 10 >= 1.5
    expect(codes).toContain('overperforming') // overperf 0.45 >= 0.06 && 30 priced singles >= 10
    expect(codes).toContain('line-timing') // lineTimingScore 1 >= 0.6 && legs 30 >= 8
    // not a low-sample case at 30 bets
    expect(codes).not.toContain('low-sample')
    // every reason carries the contract fields
    for (const reason of sharp.reasons) {
      expect(typeof reason.code).toBe('string')
      expect(typeof reason.label).toBe('string')
      expect(typeof reason.weight).toBe('number')
      expect(typeof reason.detail).toBe('string')
    }
    // the clv reason weight is the (clamped) clvPts = 55
    const clv = sharp.reasons.find((x) => x.code === 'clv-positive')!
    expect(clv.weight).toBe(55)
    // the square earns no reasons (all signals negative/zero)
    expect(square.reasons).toEqual([])
  })

  it('passes through winRate and a market breakdown on the result', () => {
    expect(sharp.winRate).toBe(0.65)
    // 30 settled moneyline singles, all won => one market row at 100%
    expect(sharp.marketWinRates).toEqual([{ market: 'moneyline', bets: 30, winRate: 1 }])
  })
})

describe('scoreRisk — confidence discounts a thin record', () => {
  // 3 hot bets with the SAME big edge as the sharp above.
  //   raw would be 100, but confidence = clamp01(3/30) = 0.1
  //   score = round(100 * 0.1) = round(10) = 10  => clean band
  const hotBets = repeat(3, () => single('moneyline', true, 2.0, 0.55))
  const hot = scoreRisk(behavior({ bets: 3, winRate: 0.65 }), hotBets)

  it('keeps a 3-bet hot streak out of the sharp bands despite a big edge', () => {
    expect(hot.clvEdgePct).toBeCloseTo(10, 10) // edge is just as strong
    expect(hot.score).toBe(10) // but heavily discounted
    expect(hot.band).toBe('clean')
  })

  it('adds a low-sample reason (confidence < 0.5 with a high raw)', () => {
    // raw = 100 (>= 40) and confidence 0.1 (< 0.5) => low-sample reason present
    const codes = hot.reasons.map((x) => x.code)
    expect(codes).toContain('low-sample')
    const low = hot.reasons.find((x) => x.code === 'low-sample')!
    expect(low.weight).toBe(0) // a flag, contributes no points
    expect(low.detail).toContain('3') // names the bet count
  })

  it('a thin record scores far below the same edge at full sample', () => {
    const fullBets = repeat(30, () => single('moneyline', true, 2.0, 0.55))
    const full = scoreRisk(behavior({ bets: 30, winRate: 0.65 }), fullBets)
    expect(full.score).toBe(100)
    expect(hot.score).toBeLessThan(full.score)
    // exactly the 10x confidence ramp: 100 * 0.1 -> 10
    expect(hot.score).toBe(Math.round(full.score * 0.1))
  })
})

describe('scoreRisk — empty / unpriced inputs are neutral', () => {
  it('no priced legs => zero edge, zero timing, zero score', () => {
    const r = scoreRisk(behavior({ bets: 0, winRate: 0 }), [])
    expect(r.clvEdgePct).toBe(0)
    expect(r.lineTimingScore).toBe(0)
    expect(r.score).toBe(0)
    expect(r.band).toBe('clean')
    expect(r.reasons).toEqual([])
    expect(r.marketWinRates).toEqual([])
  })

  it('carries the playerId through to the result', () => {
    const r = scoreRisk(behavior({ playerId: 'player-42', bets: 0, winRate: 0 }), [])
    expect(r.playerId).toBe('player-42')
  })
})

describe('scoreRisk — push/void singles are excluded from win-rate (regression)', () => {
  it('a pushed single does not count as a loss in marketWinRates or overperformance', () => {
    const bets: RiskBet[] = [
      {
        isParlay: false,
        settled: true,
        won: true,
        legs: [{ marketType: 'total', decimal: 2, trueProb: 0.5 }],
      },
      // a push: settled, not won — but stake was returned, so it must NOT drag win-rate
      {
        isParlay: false,
        settled: true,
        won: false,
        pushed: true,
        legs: [{ marketType: 'total', decimal: 2, trueProb: 0.5 }],
      },
    ]
    // only the decided single counts: 1 total, won ⇒ 100% (not 50%)
    expect(marketWinRates(bets)).toEqual([{ market: 'total', bets: 1, winRate: 1 }])
    // and overperformance reads realized 100% vs implied 50% on the one decided single
    const r = scoreRisk(behavior({ bets: 2, winRate: 0.5 }), bets)
    expect(r.marketWinRates).toEqual([{ market: 'total', bets: 1, winRate: 1 }])
  })
})
