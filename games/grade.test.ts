import { describe, it, expect } from 'vitest'
import { gradeBet } from './grade.js'
import { multiplierFor, rollFromSeeds, winChance } from './dice/fair.js'
import { limboFromSeeds } from './limbo/fair.js'
import { crashPointFromSeeds } from './crash/fair.js'
import { dropBall } from './plinko/fair.js'
import { computePlinkoTable, payouts, MIN_ROWS, MAX_ROWS } from './plinko/payouts.js'
import { drawNumbers } from './keno/fair.js'
import { buildPaytable as buildKenoPaytable } from './keno/paytable.js'
import { spinSegment } from './wheel/fair.js'
import { buildWheel } from './wheel/payouts.js'
import { spin as spinReels } from './slots/fair.js'
import { multiplierFor as slotsMultiplierFor } from './slots/payouts.js'
import { openCase } from './cases/fair.js'
import { coinAt } from './coinflip/fair.js'
import { drawGems } from './diamonds/fair.js'
import { classify, buildPaytable as buildDiamondsPaytable, PATTERNS } from './diamonds/payouts.js'
import { spinPocket } from './roulette/fair.js'
import { rollDice } from './sicbo/fair.js'
import { sumDice } from './sicbo/payouts.js'
import { deriveMines } from './mines/fair.js'
import { minesMultiplier } from './mines/multiplier.js'
import { derivePops } from './pump/fair.js'
import { pumpMultiplier } from './pump/multiplier.js'
import { crashLane } from './chickenroad/fair.js'
import { SPECS as CHICKEN_SPECS, laneMultiplier } from './chickenroad/payouts.js'
import { cardsUpTo as hiloCardsUpTo } from './hilo/fair.js'
import { deriveTower } from './dragon-tower/fair.js'
import { towerMultiplier } from './dragon-tower/difficulty.js'
import { dealBaccarat } from './baccarat/fair.js'
import { dealtDeck as vpDealtDeck } from './videopoker/fair.js'
import { evaluateHand as vpEvaluateHand } from './videopoker/payouts.js'
import { deal3 as tcpDeal } from './threecardpoker/fair.js'
import {
  pairPlusReturn,
  evaluate3 as tcpEval,
  anteBonusOdds,
  dealerQualifies as tcpDealerQualifies,
  compareHands as tcpCompare,
} from './threecardpoker/payouts.js'
import { shuffleDeck as bjShuffle } from './blackjack/fair.js'
import { handValue as bjHandValue, isBlackjack as bjIsBlackjack } from './blackjack/cards.js'

const SEEDS = { serverSeed: 'grade-server', clientSeed: 'grade-client', nonce: 1 } as const
const DICE_ROLL = rollFromSeeds(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)
const LIMBO_POINT = limboFromSeeds(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)

describe('gradeBet — dice', () => {
  it('grades a win at the priced multiplier', () => {
    const target = Math.max(0, DICE_ROLL - 10)
    const r = gradeBet({ ...SEEDS, game: 'dice', target, direction: 'over' })
    expect(r.outcome).toBe('win')
    expect(r.draw).toBe(DICE_ROLL)
    expect(r.multiplier).toBeCloseTo(multiplierFor(winChance(target, 'over')), 6)
  })

  it('grades a loss with multiplier 0', () => {
    const target = Math.min(100, DICE_ROLL + 10)
    const r = gradeBet({ ...SEEDS, game: 'dice', target, direction: 'over' })
    expect(r.outcome).toBe('loss')
    expect(r.multiplier).toBe(0)
  })

  it('grades an exact tie as a push (multiplier 1)', () => {
    const r = gradeBet({ ...SEEDS, game: 'dice', target: DICE_ROLL, direction: 'over' })
    expect(r.outcome).toBe('push')
    expect(r.multiplier).toBe(1)
  })

  it('refuses an unwinnable bet rather than settling it', () => {
    expect(() =>
      gradeBet({ ...SEEDS, game: 'dice', target: 2, direction: 'over', edge: 0.05 }),
    ).toThrow(/no profit/)
  })

  it('rejects an out-of-range target', () => {
    expect(() => gradeBet({ ...SEEDS, game: 'dice', target: 150, direction: 'over' })).toThrow(
      /0\.\.100/,
    )
  })
})

describe('gradeBet — limbo', () => {
  it('wins (paid at the target) when the point reaches the target', () => {
    const target = Math.max(1.01, Math.min(LIMBO_POINT, LIMBO_POINT))
    const r = gradeBet({ ...SEEDS, game: 'limbo', target })
    expect(r.outcome).toBe('win')
    expect(r.multiplier).toBe(target)
    expect(r.draw).toBe(LIMBO_POINT)
  })

  it('loses when the point falls short of the target', () => {
    const target = LIMBO_POINT + 5
    const r = gradeBet({ ...SEEDS, game: 'limbo', target })
    expect(r.outcome).toBe('loss')
    expect(r.multiplier).toBe(0)
  })

  it('rejects a target below the minimum', () => {
    expect(() => gradeBet({ ...SEEDS, game: 'limbo', target: 1.0 })).toThrow(/must be/)
  })
})

describe('gradeBet — crash', () => {
  const point = crashPointFromSeeds(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)

  it('wins when cashout is at or below the crash point', () => {
    const cashout = Math.max(1, point - 0.5)
    const r = gradeBet({ ...SEEDS, game: 'crash', cashout })
    expect(r.outcome).toBe('win')
    expect(r.multiplier).toBe(cashout)
    expect(r.draw).toBe(point)
  })

  it('loses when cashout exceeds the crash point', () => {
    const cashout = point + 1
    const r = gradeBet({ ...SEEDS, game: 'crash', cashout })
    expect(r.outcome).toBe('loss')
    expect(r.multiplier).toBe(0)
  })

  it('rejects a cashout below 1', () => {
    expect(() => gradeBet({ ...SEEDS, game: 'crash', cashout: 0.5 })).toThrow(/cashout must be/)
  })
})

describe('gradeBet — plinko', () => {
  it('returns the paytable multiplier for the landed slot', () => {
    const rows = 12
    const risk = 'medium' as const
    const { slot } = dropBall(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce, rows)
    const table = computePlinkoTable(rows, risk)
    const r = gradeBet({ ...SEEDS, game: 'plinko', rows, risk })
    expect(r.draw).toBe(slot)
    expect(r.multiplier).toBe(table[slot])
    expect(['win', 'loss', 'push']).toContain(r.outcome)
  })

  // Parity at the row-count boundaries, both risk extremes: the grader must agree
  // with the client's dropBall + canonical Stake table for every supported board.
  it('matches the client drop + canonical table at MIN_ROWS, low risk', () => {
    const rows = MIN_ROWS
    const { slot } = dropBall(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce, rows)
    const r = gradeBet({ ...SEEDS, game: 'plinko', rows, risk: 'low' })
    expect(r.draw).toBe(slot)
    // No config → grader uses the canonical Stake table (computePlinkoTable at the
    // 99% base is a no-op scale of `payouts`), so both must read identically.
    expect(r.multiplier).toBe(payouts(rows, 'low')[slot])
    expect(r.multiplier).toBe(computePlinkoTable(rows, 'low')[slot])
  })

  it('matches the client drop + canonical table at MAX_ROWS, high risk', () => {
    const rows = MAX_ROWS
    const { slot } = dropBall(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce, rows)
    const r = gradeBet({ ...SEEDS, game: 'plinko', rows, risk: 'high' })
    expect(r.draw).toBe(slot)
    expect(r.multiplier).toBe(payouts(rows, 'high')[slot])
  })

  it('applies a manager edge config (scaled table)', () => {
    const rows = 10
    const risk = 'medium' as const
    const config = { edge: 0.05 }
    const { slot } = dropBall(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce, rows)
    const r = gradeBet({ ...SEEDS, game: 'plinko', rows, risk, config })
    expect(r.multiplier).toBe(computePlinkoTable(rows, risk, config)[slot])
  })

  it('classifies outcome from the landed multiplier (>1 win, =1 push, <1 loss)', () => {
    const rows = 12
    const risk = 'medium' as const
    const r = gradeBet({ ...SEEDS, game: 'plinko', rows, risk })
    const expected = r.multiplier > 1 ? 'win' : r.multiplier === 1 ? 'push' : 'loss'
    expect(r.outcome).toBe(expected)
  })

  it('rejects a row count outside MIN_ROWS..MAX_ROWS', () => {
    expect(() => gradeBet({ ...SEEDS, game: 'plinko', rows: MIN_ROWS - 1, risk: 'low' })).toThrow()
    expect(() => gradeBet({ ...SEEDS, game: 'plinko', rows: MAX_ROWS + 1, risk: 'low' })).toThrow()
  })
})

describe('gradeBet — keno', () => {
  it('draws 10 numbers and counts matches against player picks', () => {
    const drawn = drawNumbers(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)
    const picks = drawn.slice(0, 5)
    const r = gradeBet({ ...SEEDS, game: 'keno', picks, risk: 'classic' })
    expect(r.draw).toBe(5)
    expect(r.draws).toEqual(drawn)
    expect(r.multiplier).toBeGreaterThan(0)
  })

  it('loses when no matches', () => {
    const drawn = drawNumbers(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)
    const drawnSet = new Set(drawn)
    const misses = Array.from({ length: 40 }, (_, i) => i + 1)
      .filter((n) => !drawnSet.has(n))
      .slice(0, 3)
    const r = gradeBet({ ...SEEDS, game: 'keno', picks: misses, risk: 'classic' })
    expect(r.draw).toBe(0)
    expect(r.outcome).toBe('loss')
  })

  it('rejects invalid pick counts', () => {
    expect(() => gradeBet({ ...SEEDS, game: 'keno', picks: [], risk: 'classic' })).toThrow()
    expect(() =>
      gradeBet({
        ...SEEDS,
        game: 'keno',
        picks: Array.from({ length: 11 }, (_, i) => i + 1),
        risk: 'classic',
      }),
    ).toThrow()
  })

  it('grades a full 10-pick board against the computed paytable', () => {
    const drawn = drawNumbers(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)
    const picks = [...drawn] // all 10 drawn numbers picked → 10 hits
    const r = gradeBet({ ...SEEDS, game: 'keno', picks, risk: 'high' })
    expect(r.draw).toBe(10)
    expect(r.multiplier).toBe(buildKenoPaytable(10, 'high')[10])
  })

  it('multiplier matches the computed paytable for the hit count, every risk', () => {
    const drawn = drawNumbers(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)
    const picks = drawn.slice(0, 4) // 4 picks, all hits
    for (const risk of ['classic', 'low', 'medium', 'high'] as const) {
      const r = gradeBet({ ...SEEDS, game: 'keno', picks, risk })
      expect(r.draw).toBe(4)
      expect(r.multiplier).toBe(buildKenoPaytable(picks.length, risk)[4])
    }
  })

  // Server-authoritative guard: the grader must not trust the request to be clean.
  it('rejects duplicate picks (would otherwise double-count a match)', () => {
    expect(() => gradeBet({ ...SEEDS, game: 'keno', picks: [5, 5], risk: 'classic' })).toThrow(
      /distinct/,
    )
  })

  it('rejects out-of-range picks', () => {
    expect(() => gradeBet({ ...SEEDS, game: 'keno', picks: [0], risk: 'classic' })).toThrow()
    expect(() => gradeBet({ ...SEEDS, game: 'keno', picks: [41], risk: 'classic' })).toThrow()
    expect(() => gradeBet({ ...SEEDS, game: 'keno', picks: [1.5], risk: 'classic' })).toThrow()
  })
})

describe('gradeBet — wheel', () => {
  it('returns the segment multiplier', () => {
    const segments = 20
    const risk = 'medium' as const
    const seg = spinSegment(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce, segments)
    const table = buildWheel(risk, segments)
    const r = gradeBet({ ...SEEDS, game: 'wheel', segments, risk })
    expect(r.draw).toBe(seg)
    expect(r.multiplier).toBe(table[seg])
  })
})

describe('gradeBet — slots', () => {
  it('returns the correct multiplier for the reel outcome', () => {
    const reels = spinReels(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)
    const mult = slotsMultiplierFor(reels)
    const r = gradeBet({ ...SEEDS, game: 'slots' })
    expect(r.draws).toEqual(reels)
    expect(r.multiplier).toBe(mult)
    expect(r.outcome).toBe(mult > 0 ? 'win' : 'loss')
  })
})

describe('gradeBet — cases', () => {
  it('opens a case and returns the tier multiplier', () => {
    const risk = 'low' as const
    const { tierIndex, multiplier: mult } = openCase(
      SEEDS.serverSeed,
      SEEDS.clientSeed,
      SEEDS.nonce,
      risk,
    )
    const r = gradeBet({ ...SEEDS, game: 'cases', risk })
    expect(r.draw).toBe(tierIndex)
    expect(r.multiplier).toBe(mult)
  })
})

describe('gradeBet — coinflip', () => {
  it('wins at 2x when call matches the flip', () => {
    const face = coinAt(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce, 0)
    const r = gradeBet({ ...SEEDS, game: 'coinflip', call: face })
    expect(r.outcome).toBe('win')
    expect(r.multiplier).toBe(2)
  })

  it('loses when call does not match', () => {
    const face = coinAt(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce, 0)
    const wrong = face === 'heads' ? 'tails' : 'heads'
    const r = gradeBet({ ...SEEDS, game: 'coinflip', call: wrong })
    expect(r.outcome).toBe('loss')
    expect(r.multiplier).toBe(0)
  })

  it('draw encodes face (0=heads, 1=tails)', () => {
    const face = coinAt(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce, 0)
    const r = gradeBet({ ...SEEDS, game: 'coinflip', call: face })
    expect(r.draw).toBe(face === 'heads' ? 0 : 1)
  })
})

describe('gradeBet — diamonds', () => {
  it('classifies the gem deal and returns paytable multiplier', () => {
    const gems = drawGems(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)
    const pattern = classify(gems)
    const table = buildDiamondsPaytable()
    const mult = table[pattern]
    const r = gradeBet({ ...SEEDS, game: 'diamonds' })
    expect(r.draws).toEqual(gems)
    expect(r.draw).toBe(PATTERNS.indexOf(pattern))
    expect(r.multiplier).toBe(mult)
    expect(r.outcome).toBe(mult > 0 ? 'win' : 'loss')
  })
})

describe('gradeBet — roulette', () => {
  const pocket = spinPocket(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)

  it('wins on a straight-up covering the winning pocket', () => {
    const r = gradeBet({ ...SEEDS, game: 'roulette', betId: `n${pocket}` })
    expect(r.outcome).toBe('win')
    expect(r.multiplier).toBe(36)
    expect(r.draw).toBe(pocket)
  })

  it('loses on a straight-up for a different number', () => {
    const other = pocket === 0 ? 1 : 0
    const r = gradeBet({ ...SEEDS, game: 'roulette', betId: `n${other}` })
    expect(r.outcome).toBe('loss')
    expect(r.multiplier).toBe(0)
  })

  it('rejects unknown bet ids', () => {
    expect(() => gradeBet({ ...SEEDS, game: 'roulette', betId: 'xyzzy' })).toThrow()
  })
})

describe('gradeBet — sicbo', () => {
  const dice = rollDice(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)
  const total = sumDice(dice)

  it('grades a winning total bet', () => {
    if (total >= 4 && total <= 17) {
      const r = gradeBet({ ...SEEDS, game: 'sicbo', bet: { type: 'total', param: total } })
      expect(r.outcome).toBe('win')
      expect(r.multiplier).toBeGreaterThan(1)
      expect(r.draw).toBe(total)
      expect(r.draws).toEqual([...dice])
    }
  })

  it('grades a losing anyTriple bet when dice are not a triple', () => {
    if (dice[0] !== dice[1] || dice[1] !== dice[2]) {
      const r = gradeBet({ ...SEEDS, game: 'sicbo', bet: { type: 'anyTriple' } })
      expect(r.outcome).toBe('loss')
      expect(r.multiplier).toBe(0)
    }
  })

  it('rejects a malformed bet spec', () => {
    expect(() =>
      gradeBet({ ...SEEDS, game: 'sicbo', bet: { type: 'single', param: 7 } }),
    ).toThrow()
  })
})

describe('gradeBet — mines', () => {
  const mines3 = deriveMines(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce, 3)
  const mineSet = new Set(mines3)
  const safeTiles = Array.from({ length: 25 }, (_, i) => i).filter((i) => !mineSet.has(i))

  it('wins when all reveals are safe (cash-out)', () => {
    const reveals = safeTiles.slice(0, 3)
    const r = gradeBet({ ...SEEDS, game: 'mines', mineCount: 3, reveals })
    expect(r.outcome).toBe('win')
    expect(r.multiplier).toBeCloseTo(minesMultiplier(3, 3), 6)
    expect(r.draw).toBe(-1)
    expect(r.draws).toEqual(mines3)
  })

  it('loses when a mine tile is revealed', () => {
    const reveals = [...safeTiles.slice(0, 2), mines3[0]]
    const r = gradeBet({ ...SEEDS, game: 'mines', mineCount: 3, reveals })
    expect(r.outcome).toBe('loss')
    expect(r.multiplier).toBe(0)
    expect(r.draw).toBe(mines3[0])
  })

  it('wins with 0 reveals (immediate cash-out at house edge)', () => {
    const r = gradeBet({ ...SEEDS, game: 'mines', mineCount: 3, reveals: [] })
    expect(r.outcome).toBe('win')
    expect(r.multiplier).toBeCloseTo(minesMultiplier(3, 0), 6)
  })

  // Parity across the mine-count range, including a full-board clear at each.
  it('matches the client layout + multiplier for mineCount 1, 12, 24', () => {
    for (const mineCount of [1, 12, 24]) {
      const mines = deriveMines(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce, mineCount)
      const safe = Array.from({ length: 25 }, (_, i) => i).filter((i) => !mines.includes(i))
      const r = gradeBet({ ...SEEDS, game: 'mines', mineCount, reveals: safe })
      expect(r.outcome).toBe('win')
      expect(r.draws).toEqual(mines)
      // A full clear pays (1 − edge) × C(25, mineCount): the top of the board.
      expect(r.multiplier).toBeCloseTo(minesMultiplier(mineCount, safe.length), 6)
    }
  })

  // Server-authoritative guards: a tampered client must not be able to repeat a
  // safe tile (inflating the multiplier) or send an out-of-range index.
  it('rejects duplicate reveals (would otherwise inflate the multiplier)', () => {
    const reveals = [safeTiles[0], safeTiles[0]]
    expect(() => gradeBet({ ...SEEDS, game: 'mines', mineCount: 3, reveals })).toThrow(/distinct/)
  })

  it('rejects out-of-range reveal tiles', () => {
    expect(() => gradeBet({ ...SEEDS, game: 'mines', mineCount: 3, reveals: [25] })).toThrow()
    expect(() => gradeBet({ ...SEEDS, game: 'mines', mineCount: 3, reveals: [-1] })).toThrow()
    expect(() => gradeBet({ ...SEEDS, game: 'mines', mineCount: 3, reveals: [2.5] })).toThrow()
  })

  it('rejects an invalid mine count', () => {
    expect(() => gradeBet({ ...SEEDS, game: 'mines', mineCount: 0, reveals: [] })).toThrow()
    expect(() => gradeBet({ ...SEEDS, game: 'mines', mineCount: 25, reveals: [] })).toThrow()
  })
})

describe('gradeBet — pump', () => {
  const difficulty = 'medium' as const
  const pops = derivePops(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce, difficulty)
  const firstPop = Math.min(...pops)

  it('wins when all pumped cells are safe', () => {
    const safePumps = firstPop
    if (safePumps > 0) {
      const r = gradeBet({ ...SEEDS, game: 'pump', difficulty, pumps: safePumps })
      expect(r.outcome).toBe('win')
      expect(r.multiplier).toBeCloseTo(pumpMultiplier(difficulty, safePumps), 6)
      expect(r.draw).toBe(-1)
      expect(r.draws).toEqual(pops)
    }
  })

  it('loses when pumped into a pop cell', () => {
    const r = gradeBet({ ...SEEDS, game: 'pump', difficulty, pumps: firstPop + 1 })
    expect(r.outcome).toBe('loss')
    expect(r.multiplier).toBe(0)
    expect(r.draw).toBe(firstPop)
  })

  it('wins with 0 pumps', () => {
    const r = gradeBet({ ...SEEDS, game: 'pump', difficulty, pumps: 0 })
    expect(r.outcome).toBe('win')
    expect(r.multiplier).toBeGreaterThan(0)
  })
})

describe('gradeBet — chickenroad', () => {
  const difficulty = 'medium' as const
  const spec = CHICKEN_SPECS[difficulty]
  const cl = crashLane(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce, spec.survival, spec.lanes)

  it('pushes when no lanes crossed (cashoutLane 0)', () => {
    const r = gradeBet({ ...SEEDS, game: 'chickenroad', difficulty, cashoutLane: 0 })
    expect(r.outcome).toBe('push')
    expect(r.multiplier).toBe(1)
    expect(r.draw).toBe(cl)
  })

  it('wins when cashed out before the crash lane', () => {
    if (cl > 1) {
      const cashoutLane = cl - 1
      const r = gradeBet({ ...SEEDS, game: 'chickenroad', difficulty, cashoutLane })
      expect(r.outcome).toBe('win')
      expect(r.multiplier).toBeCloseTo(laneMultiplier(cashoutLane, difficulty), 6)
      expect(r.draw).toBe(cl)
    }
  })

  it('loses when crossing the crash lane', () => {
    const r = gradeBet({ ...SEEDS, game: 'chickenroad', difficulty, cashoutLane: cl })
    expect(r.outcome).toBe('loss')
    expect(r.multiplier).toBe(0)
  })
})

describe('gradeBet — hilo', () => {
  it('wins when all guesses are correct', () => {
    const cards = hiloCardsUpTo(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce, 3)
    const guesses = cards.slice(0, 2).map((c, i): 'hi' | 'lo' => {
      const next = cards[i + 1]
      return next.rank >= c.rank ? 'hi' : 'lo'
    })
    const r = gradeBet({ ...SEEDS, game: 'hilo', guesses })
    expect(['win', 'push']).toContain(r.outcome)
    expect(r.multiplier).toBeGreaterThanOrEqual(1)
    expect(r.draws).toHaveLength(3)
  })

  it('loses when a guess is wrong', () => {
    const cards = hiloCardsUpTo(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce, 2)
    const wrongGuess: 'hi' | 'lo' = cards[1].rank >= cards[0].rank ? 'lo' : 'hi'
    if (cards[1].rank !== cards[0].rank) {
      const r = gradeBet({ ...SEEDS, game: 'hilo', guesses: [wrongGuess] })
      expect(r.outcome).toBe('loss')
      expect(r.multiplier).toBe(0)
    }
  })

  it('returns a push with multiplier 1 when no guesses are made', () => {
    const r = gradeBet({ ...SEEDS, game: 'hilo', guesses: [] })
    expect(r.outcome).toBe('push')
    expect(r.multiplier).toBe(1)
  })
})

describe('gradeBet — dragon-tower', () => {
  const difficulty = 'medium' as const
  const layout = deriveTower(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce, difficulty)
  const tiles = 3
  const skullsRow0 = new Set(layout[0])
  const safeRow0 = Array.from({ length: tiles }, (_, i) => i).find((t) => !skullsRow0.has(t))!

  it('wins when all picks are eggs', () => {
    const r = gradeBet({ ...SEEDS, game: 'dragon-tower', difficulty, picks: [safeRow0] })
    expect(r.outcome).toBe('win')
    expect(r.multiplier).toBeCloseTo(towerMultiplier(difficulty, 1), 6)
    expect(r.draw).toBe(1)
  })

  it('loses when a skull is picked', () => {
    const skull = layout[0][0]
    const r = gradeBet({ ...SEEDS, game: 'dragon-tower', difficulty, picks: [skull] })
    expect(r.outcome).toBe('loss')
    expect(r.draw).toBe(0)
  })

  it('wins with 0 picks (immediate cash-out)', () => {
    const r = gradeBet({ ...SEEDS, game: 'dragon-tower', difficulty, picks: [] })
    expect(r.outcome).toBe('win')
    expect(r.multiplier).toBeGreaterThan(0)
  })
})

describe('gradeBet — baccarat', () => {
  const deal = dealBaccarat(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)

  it('grades the correct outcome for a player bet', () => {
    const r = gradeBet({ ...SEEDS, game: 'baccarat', bet: 'player' })
    if (deal.winner === 'player') {
      expect(r.outcome).toBe('win')
      expect(r.multiplier).toBe(2)
    } else if (deal.winner === 'tie') {
      expect(r.outcome).toBe('push')
      expect(r.multiplier).toBe(1)
    } else {
      expect(r.outcome).toBe('loss')
      expect(r.multiplier).toBe(0)
    }
  })

  it('encodes winner in draw and totals in draws', () => {
    const r = gradeBet({ ...SEEDS, game: 'baccarat', bet: 'banker' })
    const winnerMap: Record<string, number> = { player: 0, banker: 1, tie: 2 }
    expect(r.draw).toBe(winnerMap[deal.winner])
    expect(r.draws).toEqual([deal.playerTotal, deal.bankerTotal])
  })
})

describe('gradeBet — videopoker', () => {
  it('holds all 5 and evaluates the initial hand', () => {
    const deck = vpDealtDeck(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)
    const expected = vpEvaluateHand(deck.slice(0, 5))
    const r = gradeBet({ ...SEEDS, game: 'videopoker', holds: [true, true, true, true, true] })
    expect(r.multiplier).toBe(expected.multiplier)
    expect(r.draws).toHaveLength(5)
  })

  it('holds none and draws from positions 5-9', () => {
    const deck = vpDealtDeck(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)
    const expected = vpEvaluateHand(deck.slice(5, 10))
    const r = gradeBet({ ...SEEDS, game: 'videopoker', holds: [false, false, false, false, false] })
    expect(r.multiplier).toBe(expected.multiplier)
  })

  it('rejects wrong holds length', () => {
    expect(() => gradeBet({ ...SEEDS, game: 'videopoker', holds: [true, true] })).toThrow()
  })
})

describe('gradeBet — threecardpoker', () => {
  const { player, dealer } = tcpDeal(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)
  const playerValue = tcpEval(player)
  const dealerValue = tcpEval(dealer)

  it('grades pairplus from the player hand', () => {
    const expected = pairPlusReturn(playerValue)
    const r = gradeBet({ ...SEEDS, game: 'threecardpoker', bet: 'pairplus' })
    expect(r.multiplier).toBe(expected)
    expect(r.outcome).toBe(expected > 0 ? 'win' : 'loss')
  })

  it('grades ante as a loss on fold', () => {
    const r = gradeBet({ ...SEEDS, game: 'threecardpoker', bet: 'ante', decision: 'fold' })
    expect(r.outcome).toBe('loss')
    expect(r.multiplier).toBe(0)
  })

  it('grades ante correctly when playing', () => {
    const bonus = anteBonusOdds(playerValue)
    const qualifies = tcpDealerQualifies(dealerValue)
    let base = 0
    if (!qualifies) {
      base = 2
    } else {
      const cmp = tcpCompare(playerValue, dealerValue)
      base = cmp > 0 ? 2 : cmp < 0 ? 0 : 1
    }
    const r = gradeBet({ ...SEEDS, game: 'threecardpoker', bet: 'ante', decision: 'play' })
    expect(r.multiplier).toBe(base + bonus)
  })

  it('grades the play wager independently from the ante', () => {
    const r = gradeBet({ ...SEEDS, game: 'threecardpoker', bet: 'play', decision: 'play' })
    expect([0, 1, 2]).toContain(r.multiplier)
  })

  it('throws when play bet has fold decision', () => {
    expect(() =>
      gradeBet({ ...SEEDS, game: 'threecardpoker', bet: 'play', decision: 'fold' }),
    ).toThrow()
  })

  it('throws when ante bet is missing a decision', () => {
    expect(() => gradeBet({ ...SEEDS, game: 'threecardpoker', bet: 'ante' })).toThrow()
  })
})

describe('gradeBet — blackjack', () => {
  const deck = bjShuffle(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)
  const playerCards = [deck[0], deck[2]]
  const dealerCards = [deck[1], deck[3]]
  const playerNatural = bjIsBlackjack(playerCards)
  const dealerNatural = bjIsBlackjack(dealerCards)

  it('returns a valid outcome with totals in draws when standing', () => {
    if (!playerNatural && !dealerNatural) {
      const r = gradeBet({ ...SEEDS, game: 'blackjack', actions: ['stand'] })
      expect(['win', 'loss', 'push']).toContain(r.outcome)
      expect(r.draws).toHaveLength(2)
      expect(r.draw).toBe(bjHandValue(playerCards).total)
    }
  })

  it('pays 2.5x for a natural blackjack (no dealer natural)', () => {
    if (playerNatural && !dealerNatural) {
      const r = gradeBet({ ...SEEDS, game: 'blackjack', actions: [] })
      expect(r.outcome).toBe('win')
      expect(r.multiplier).toBe(2.5)
    }
  })

  it('pushes on mutual blackjack', () => {
    if (playerNatural && dealerNatural) {
      const r = gradeBet({ ...SEEDS, game: 'blackjack', actions: [] })
      expect(r.outcome).toBe('push')
      expect(r.multiplier).toBe(1)
    }
  })

  it('returns a valid outcome after multiple hits', () => {
    if (!playerNatural && !dealerNatural) {
      const r = gradeBet({
        ...SEEDS,
        game: 'blackjack',
        actions: Array<'hit'>(15).fill('hit'),
      })
      expect(['win', 'loss', 'push']).toContain(r.outcome)
    }
  })
})
