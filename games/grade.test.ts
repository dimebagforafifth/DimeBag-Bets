import { describe, it, expect } from 'vitest'
import { gradeBet } from './grade.js'
import { multiplierFor, rollFromSeeds, winChance } from './dice/fair.js'
import { limboFromSeeds } from './limbo/fair.js'

const SEEDS = { serverSeed: 'grade-server', clientSeed: 'grade-client', nonce: 1 } as const
const DICE_ROLL = rollFromSeeds(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)
const LIMBO_POINT = limboFromSeeds(SEEDS.serverSeed, SEEDS.clientSeed, SEEDS.nonce)

describe('gradeBet — dice', () => {
  it('grades a win at the priced multiplier', () => {
    const target = Math.max(0, DICE_ROLL - 10) // roll lands above → "over" wins
    const r = gradeBet({ ...SEEDS, game: 'dice', target, direction: 'over' })
    expect(r.outcome).toBe('win')
    expect(r.draw).toBe(DICE_ROLL)
    expect(r.multiplier).toBeCloseTo(multiplierFor(winChance(target, 'over')), 6)
  })

  it('grades a loss with multiplier 0', () => {
    const target = Math.min(100, DICE_ROLL + 10) // roll below target → "over" loses
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
    const target = Math.max(1.01, Math.min(LIMBO_POINT, LIMBO_POINT)) // target ≤ point → win
    const r = gradeBet({ ...SEEDS, game: 'limbo', target })
    expect(r.outcome).toBe('win')
    expect(r.multiplier).toBe(target)
    expect(r.draw).toBe(LIMBO_POINT)
  })

  it('loses when the point falls short of the target', () => {
    const target = LIMBO_POINT + 5 // unreachable → loss
    const r = gradeBet({ ...SEEDS, game: 'limbo', target })
    expect(r.outcome).toBe('loss')
    expect(r.multiplier).toBe(0)
  })

  it('rejects a target below the minimum', () => {
    expect(() => gradeBet({ ...SEEDS, game: 'limbo', target: 1.0 })).toThrow(/must be/)
  })
})
