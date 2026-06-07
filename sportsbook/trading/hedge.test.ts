import { describe, it, expect } from 'vitest'
import { hedgeToLock, evaluateHedge, maxBookStake } from './hedge.js'

describe('hedgeToLock', () => {
  it('locks an equal profit whoever wins', () => {
    // open 100 @ 3.0, hedge available @ 2.0 → hedge 150, locked 50 either way
    const r = hedgeToLock(100, 3.0, 2.0)
    expect(r.hedgeStake).toBeCloseTo(150, 6)
    expect(r.lockedProfit).toBeCloseTo(50, 6)
    const o = evaluateHedge(100, 3.0, r.hedgeStake, 2.0)
    expect(o.profitIfOpenWins).toBeCloseTo(50, 6)
    expect(o.profitIfHedgeWins).toBeCloseTo(50, 6)
  })

  it('rejects bad odds', () => {
    expect(() => hedgeToLock(100, 1, 2)).toThrow()
    expect(() => hedgeToLock(100, 3, 1)).toThrow()
  })
})

describe('evaluateHedge', () => {
  it('reports both outcomes and the guaranteed floor for a partial hedge', () => {
    // under-hedging the 100 @ 3.0 with only 100 @ 2.0
    const o = evaluateHedge(100, 3.0, 100, 2.0)
    expect(o.profitIfOpenWins).toBeCloseTo(100, 6) // 200 − 100
    expect(o.profitIfHedgeWins).toBeCloseTo(0, 6) // 100 − 100
    expect(o.guaranteed).toBeCloseTo(0, 6)
  })

  it('a full lock makes both outcomes equal to the guaranteed floor', () => {
    const r = hedgeToLock(50, 4.0, 1.8)
    const o = evaluateHedge(50, 4.0, r.hedgeStake, 1.8)
    expect(o.profitIfOpenWins).toBeCloseTo(o.profitIfHedgeWins, 6)
    expect(o.guaranteed).toBeCloseTo(r.lockedProfit, 6)
  })
})

describe('maxBookStake', () => {
  it('is (cap − current) / (decimal − 1)', () => {
    expect(maxBookStake(1000, 3.0)).toBeCloseTo(500, 6) // 1000 / 2
    expect(maxBookStake(1000, 2.0)).toBeCloseTo(1000, 6) // 1000 / 1
    expect(maxBookStake(1000, 3.0, 400)).toBeCloseTo(300, 6) // 600 / 2
  })

  it('never goes negative once the cap is already used up', () => {
    expect(maxBookStake(1000, 3.0, 1000)).toBe(0)
    expect(maxBookStake(1000, 3.0, 1500)).toBe(0)
  })

  it('rejects bad inputs', () => {
    expect(() => maxBookStake(1000, 1)).toThrow()
    expect(() => maxBookStake(-1, 2)).toThrow()
  })
})
