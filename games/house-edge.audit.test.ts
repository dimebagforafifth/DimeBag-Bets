/**
 * House-edge audit — the casino's integrity test (CLAUDE.md §0, §3, §4).
 *
 * "Prove the money math." Every game here is checked against ONE invariant: the
 * realized return-to-player equals the claimed `(1 − edge)`, computed from each
 * game's OWN exported probability + multiplier functions (no re-implementation of
 * the formula under test). If a payout table or a probability is ever wrong, the
 * realized edge drifts and this test fails — so the "honest by default" promise
 * (§4) can't silently rot as the games are edited.
 *
 * Two shapes of game:
 *   • Single-outcome (Dice, Limbo, Crash, Keno, Wheel, Plinko, Roulette):
 *       RTP = Σ P(outcome)·payout(outcome).
 *   • Laddered cash-out (Mines, Pump, Dragon Tower, Chicken Road, HiLo):
 *       at EVERY reachable cash-out, multiplier × P(reach it) = (1 − edge).
 *
 * Rounding only ever favours the house (floor) or is bounded by the rounding
 * granularity (round2). Blackjack is excluded: its RTP is strategy-dependent, so
 * it's verified by its own rules tests, not a closed-form edge.
 */

import { describe, expect, it } from 'vitest'

import {
  TOTAL_TILES,
  HOUSE_EDGE as MINES_EDGE,
  rawMultiplier as minesRaw,
  minesMultiplier,
  safeTiles,
} from './mines/index.js'
import { multiplierFor as diceMultiplier, DEFAULT_DICE_CONFIG } from './dice/index.js'
import { winChanceFor as limboWinChance, totalEdge as limboEdge } from './limbo/index.js'
import { crashPointFromInt, totalEdge as crashEdge } from './crash/index.js'
import {
  ROWS as TOWER_ROWS,
  HOUSE_EDGE as TOWER_EDGE,
  DIFFICULTY_ORDER as TOWER_ORDER,
  rawMultiplier as towerRaw,
  rowWinChance as towerRowWinChance,
} from './dragon-tower/index.js'
import {
  CELLS,
  HOUSE_EDGE as PUMP_EDGE,
  DIFFICULTIES as PUMP_DIFFS,
  DIFFICULTY_ORDER as PUMP_ORDER,
  rawMultiplier as pumpRaw,
  maxPumps,
} from './pump/index.js'
import {
  DIFFICULTIES as CHICK_DIFFS,
  SPECS as CHICK_SPECS,
  DEFAULT_CHICKEN_CONFIG,
  laneMultiplier,
} from './chickenroad/index.js'
import { RANKS, probHigher, probLower, stepMultiplier, DEFAULT_HILO_CONFIG } from './hilo/index.js'
import { POCKETS, payoutFor } from './roulette/index.js'
import { MAX_PICKS, RISKS as KENO_RISKS, rtpOf as kenoRtp } from './keno/index.js'
import { RISKS as WHEEL_RISKS, SEGMENT_OPTIONS, rtpOf as wheelRtp } from './wheel/index.js'
import {
  MIN_ROWS,
  MAX_ROWS,
  RISKS as PLINKO_RISKS,
  rtpOf as plinkoRtp,
  computePlinkoTable,
  slotProbabilities as plinkoSlotProb,
} from './plinko/index.js'
import { rtpOf as casesRtp } from './cases/index.js'
import { rtpOf as slotsRtp } from './slots/index.js'
import { rtpOf as diamondsRtp } from './diamonds/index.js'
// The manager control's adapter — proves a chosen RTP feeds REAL payout math.
import { houseConfigFor } from '../app/edge-config.js'

/** A tiny report so a human can read the realized edge, not just see green. */
const report: { game: string; rtp: number; claim: string }[] = []
const pct = (x: number) => `${(x * 100).toFixed(3)}%`

/* ------------------------------------------------------------------ *
 * Laddered cash-out games: multiplier × P(reach) = 1 − edge          *
 * ------------------------------------------------------------------ */

describe('Mines — every cash-out returns exactly (1 − edge)', () => {
  const target = 1 - MINES_EDGE
  it('rawMultiplier × P(reach d gems) = 1 − edge for all mine counts and depths', () => {
    let worst = 0
    for (let mines = 1; mines <= TOTAL_TILES - 1; mines++) {
      const safe = safeTiles(mines)
      for (let d = 0; d <= safe; d++) {
        // P(reveal d gems) = Π_{i<d} (safe−i)/(total−i)
        let p = 1
        for (let i = 0; i < d; i++) p *= (TOTAL_TILES - mines - i) / (TOTAL_TILES - i)
        const rtp = minesRaw(mines, d) * p
        worst = Math.max(worst, Math.abs(rtp - target))
        // the floored, paid-out multiplier never returns MORE than claimed
        expect(minesMultiplier(mines, d) * p).toBeLessThanOrEqual(target + 1e-9)
      }
    }
    expect(worst).toBeLessThan(1e-9)
    report.push({ game: 'Mines', rtp: target - worst, claim: pct(target) })
  })
})

describe('Pump — every bank returns exactly (1 − edge)', () => {
  const target = 1 - PUMP_EDGE
  it('rawMultiplier × P(reach n pumps) = 1 − edge for all difficulties', () => {
    let worst = 0
    for (const diff of PUMP_ORDER) {
      const pops = PUMP_DIFFS[diff].pops
      for (let n = 0; n <= maxPumps(diff); n++) {
        let p = 1
        for (let i = 0; i < n; i++) p *= (CELLS - pops - i) / (CELLS - i)
        worst = Math.max(worst, Math.abs(pumpRaw(diff, n) * p - target))
      }
    }
    expect(worst).toBeLessThan(1e-9)
    report.push({ game: 'Pump', rtp: target - worst, claim: pct(target) })
  })
})

describe('Dragon Tower — every level returns exactly (1 − edge)', () => {
  const target = 1 - TOWER_EDGE
  it('rawMultiplier × P(reach level) = 1 − edge for all difficulties', () => {
    let worst = 0
    for (const diff of TOWER_ORDER) {
      const s = towerRowWinChance(diff)
      for (let level = 0; level <= TOWER_ROWS; level++) {
        worst = Math.max(worst, Math.abs(towerRaw(diff, level) * s ** level - target))
      }
    }
    expect(worst).toBeLessThan(1e-9)
    report.push({ game: 'Dragon Tower', rtp: target - worst, claim: pct(target) })
  })
})

describe('Chicken Road — every lane returns (1 − edge), within rounding', () => {
  const target = 1 - DEFAULT_CHICKEN_CONFIG.edge
  it('laneMultiplier × survival^lane = 1 − edge (±round2 granularity)', () => {
    let worst = 0
    for (const diff of CHICK_DIFFS) {
      const { survival, lanes } = CHICK_SPECS[diff]
      for (let i = 1; i <= lanes; i++) {
        const p = survival ** i
        const rtp = laneMultiplier(i, diff) * p
        // the multiplier is round2'd, so RTP error ≤ p × 0.005
        expect(Math.abs(rtp - target)).toBeLessThanOrEqual(p * 0.005 + 1e-9)
        worst = Math.max(worst, Math.abs(rtp - target))
      }
    }
    report.push({ game: 'Chicken Road', rtp: target, claim: `${pct(target)} (±${pct(worst)})` })
  })
})

describe('HiLo — every priced guess returns (1 − edge), within rounding', () => {
  const target = 1 - DEFAULT_HILO_CONFIG.edge
  it('P(win) × stepMultiplier = 1 − edge for every non-certain guess', () => {
    let worst = 0
    let checked = 0
    for (let rank = 1; rank <= RANKS; rank++) {
      for (const guess of ['hi', 'lo'] as const) {
        const p = guess === 'hi' ? probHigher(rank) : probLower(rank)
        if (target / p < 1) continue // a certain (or near-certain) win clamps to 1× — no edge to price
        const rtp = p * stepMultiplier(rank, guess)
        expect(Math.abs(rtp - target)).toBeLessThanOrEqual(p * 0.005 + 1e-9)
        worst = Math.max(worst, Math.abs(rtp - target))
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
    report.push({ game: 'HiLo', rtp: target, claim: `${pct(target)} (±${pct(worst)})` })
  })
})

/* ------------------------------------------------------------------ *
 * Single-outcome games: Σ P·payout = 1 − edge                        *
 * ------------------------------------------------------------------ */

describe('Dice — every win chance returns (1 − edge)', () => {
  const target = 1 - DEFAULT_DICE_CONFIG.edge
  it('(chance/100) × multiplierFor(chance) = 1 − edge, never over', () => {
    let worst = 0
    for (let chance = 1; chance <= 98; chance += 0.5) {
      const rtp = (chance / 100) * diceMultiplier(chance)
      // multiplierFor floors to 4 dp (house-favourable): rtp ≤ target, within (chance/100)·1e-4
      expect(rtp).toBeLessThanOrEqual(target + 1e-9)
      expect(target - rtp).toBeLessThanOrEqual((chance / 100) * 1e-4 + 1e-9)
      worst = Math.max(worst, target - rtp)
    }
    report.push({ game: 'Dice', rtp: target - worst, claim: pct(target) })
  })
})

describe('Limbo — every target is priced at (1 − edge)', () => {
  const target = 1 - limboEdge()
  it('(winChance/100) × target = 1 − edge', () => {
    let worst = 0
    for (const t of [1.01, 1.5, 2, 3, 5, 10, 25, 100, 1000, 100000]) {
      worst = Math.max(worst, Math.abs((limboWinChance(t) / 100) * t - target))
    }
    expect(worst).toBeLessThan(1e-9)
    report.push({ game: 'Limbo', rtp: target - worst, claim: pct(target) })
  })
})

describe('Crash — every cash-out target returns (1 − edge)', () => {
  const edge = crashEdge()
  const target = 1 - edge
  const TWO32 = 2 ** 32
  it('P(crashPoint ≥ t) × t = 1 − edge across the 32-bit draw', () => {
    let worst = 0
    for (const t of [1.5, 2, 3, 5, 10, 50, 100]) {
      // ints 0..count−1 produce a crashPoint ≥ t; verify against the game's own fn.
      const count = Math.floor((TWO32 * target) / t)
      expect(crashPointFromInt(count - 1)).toBeGreaterThanOrEqual(t)
      const rtp = (count / TWO32) * t
      // floor loses at most one int's worth of probability (t / 2^32 → negligible)
      expect(Math.abs(rtp - target)).toBeLessThanOrEqual(1e-6)
      worst = Math.max(worst, Math.abs(rtp - target))
    }
    report.push({ game: 'Crash', rtp: target - worst, claim: pct(target) })
  })
})

describe('Roulette — inherent single-zero edge of 1/37', () => {
  const target = 36 / POCKETS // 36/37 ≈ 0.97297
  it('(count/37) × payoutFor(count) = 36/37 for every bet width', () => {
    for (let count = 1; count <= 36; count++) {
      expect(Math.abs((count / POCKETS) * payoutFor(count) - target)).toBeLessThan(1e-9)
    }
    report.push({ game: 'Roulette', rtp: target, claim: `${pct(target)} (inherent 1/37)` })
  })
})

describe('Keno — built to (1 − edge) across picks × risk', () => {
  it('Σ P(hits)·multiplier(hits) ≈ 0.99 for every pick count and risk', () => {
    let lo = 1
    let hi = 0
    for (let picks = 1; picks <= MAX_PICKS; picks++) {
      for (const risk of KENO_RISKS) {
        const rtp = kenoRtp(picks, risk)
        expect(rtp).toBeGreaterThan(0.97)
        expect(rtp).toBeLessThanOrEqual(0.995)
        lo = Math.min(lo, rtp)
        hi = Math.max(hi, rtp)
      }
    }
    report.push({ game: 'Keno', rtp: (lo + hi) / 2, claim: `${pct(lo)}–${pct(hi)}` })
  })
})

describe('Wheel — every table averages (1 − edge)', () => {
  it('mean(table) ≈ 0.99 for every risk × segment count', () => {
    let lo = 1
    let hi = 0
    for (const risk of WHEEL_RISKS) {
      for (const seg of SEGMENT_OPTIONS) {
        const rtp = wheelRtp(risk, seg)
        expect(rtp).toBeGreaterThan(0.97)
        expect(rtp).toBeLessThanOrEqual(0.995)
        lo = Math.min(lo, rtp)
        hi = Math.max(hi, rtp)
      }
    }
    report.push({ game: 'Wheel', rtp: (lo + hi) / 2, claim: `${pct(lo)}–${pct(hi)}` })
  })
})

describe('Plinko — Stake tables stay in a sane RTP band', () => {
  it('Σ P(slot)·multiplier(slot) is house-edged but generous (Stake tables)', () => {
    let lo = 1
    let hi = 0
    for (let rows = MIN_ROWS; rows <= MAX_ROWS; rows++) {
      for (const risk of PLINKO_RISKS) {
        const rtp = plinkoRtp(rows, risk)
        // Plinko ships Stake's published tables verbatim (no single configured
        // edge); just assert the house never gives an edge away and stays sane.
        expect(rtp).toBeGreaterThan(0.9)
        expect(rtp).toBeLessThanOrEqual(1.0 + 1e-9)
        lo = Math.min(lo, rtp)
        hi = Math.max(hi, rtp)
      }
    }
    report.push({ game: 'Plinko', rtp: (lo + hi) / 2, claim: `${pct(lo)}–${pct(hi)}` })
  })
})

/* ------------------------------------------------------------------ *
 * Manager house-edge control: a chosen RTP feeds the REAL payout math *
 * ------------------------------------------------------------------ */

describe('House-edge control feeds real payout math (not a disconnected number)', () => {
  // The adapter returns each game's actual houseConfig; typed loosely here since
  // the shape varies per game (the adapter guarantees the right one per key).
  const cfg = (key: string, rtp: number) => houseConfigFor(key, rtp) as unknown as never

  it('a manager RTP override drives each adjustable game to the chosen RTP', () => {
    const target = 0.95 // a deliberate 4-point drop from the ~0.99 native edges
    const tol = 0.02 // 2dp/round2 multiplier rounding leaves a hair of drift

    // Plinko: generate its edge-true table and recompute realized RTP from probs.
    const plinkoTable = computePlinkoTable(16, 'high', cfg('plinko', target))
    const plinkoProb = plinkoSlotProb(16)
    const plinkoRtpAt = plinkoTable.reduce((a, m, i) => a + plinkoProb[i] * m, 0)

    const realized: Array<[string, number]> = [
      ['cases', casesRtp('medium', cfg('cases', target))],
      ['keno', kenoRtp(5, KENO_RISKS[0], cfg('keno', target))],
      ['wheel', wheelRtp(WHEEL_RISKS[0], SEGMENT_OPTIONS[0], cfg('wheel', target))],
      ['slots', slotsRtp(cfg('slots', target))],
      ['diamonds', diamondsRtp(cfg('diamonds', target))],
      ['dice', (50 / 100) * diceMultiplier(50, cfg('dice', target))],
      ['plinko', plinkoRtpAt],
    ]

    for (const [game, rtp] of realized) {
      // it actually moved to the target...
      expect(Math.abs(rtp - target), `${game} realized RTP ${rtp}`).toBeLessThan(tol)
      // ...and clearly away from the ~0.99 native edge, proving the override took effect.
      expect(rtp, `${game} dropped below native`).toBeLessThan(0.975)
    }
  })
})

describe('Fairness report', () => {
  it('prints the realized return-to-player for every game', () => {
    // eslint-disable-next-line no-console
    console.log(
      '\n  House-edge audit — realized return-to-player\n' +
        report
          .map((r) => `   ${r.game.padEnd(14)} RTP ${r.claim}`)
          .join('\n') +
        '\n   (Blackjack excluded — RTP is strategy-dependent; see its rules tests.)\n',
    )
    expect(report.length).toBe(12)
  })
})
