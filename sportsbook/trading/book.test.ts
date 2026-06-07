import { describe, it, expect } from 'vitest'
import {
  exposure,
  balancedStakeFractions,
  expectedHold,
  suggestLineMove,
  type BookPosition,
} from './book.js'

describe('exposure', () => {
  it('a balanced book has equal net whoever wins', () => {
    const positions: BookPosition[] = [
      { name: 'A', decimal: 2, stake: 100 },
      { name: 'B', decimal: 2, stake: 100 },
    ]
    const r = exposure(positions)
    expect(r.totalStake).toBe(200)
    expect(r.outcomes[0].ifWins).toBe(0) // 200 − 100×2
    expect(r.outcomes[1].ifWins).toBe(0)
    expect(r.balanced).toBe(true)
    expect(r.worstCase).toBe(0)
  })

  it('an unbalanced book is exposed to its heavy side', () => {
    const positions: BookPosition[] = [
      { name: 'A', decimal: 2, stake: 150 },
      { name: 'B', decimal: 2, stake: 50 },
    ]
    const r = exposure(positions)
    expect(r.outcomes[0].ifWins).toBe(-100) // 200 − 150×2
    expect(r.outcomes[0].liability).toBe(100)
    expect(r.outcomes[1].ifWins).toBe(100) // 200 − 50×2
    expect(r.worstCase).toBe(-100)
    expect(r.worstOutcome).toBe('A')
    expect(r.balanced).toBe(false)
  })

  it('a margin book profits whoever wins when balanced', () => {
    // lay both sides at 1.90 (overround ~1.0526) and take equal money
    const positions: BookPosition[] = [
      { name: 'A', decimal: 1.9, stake: 100 },
      { name: 'B', decimal: 1.9, stake: 100 },
    ]
    const r = exposure(positions)
    expect(r.outcomes[0].ifWins).toBeCloseTo(10, 6) // 200 − 190
    expect(r.outcomes[1].ifWins).toBeCloseTo(10, 6)
    expect(r.worstCase).toBeCloseTo(10, 6) // the book wins 10 no matter what
  })
})

describe('balancedStakeFractions', () => {
  it('is proportional to 1/decimal (equal payout each way)', () => {
    const f = balancedStakeFractions([1.5, 3.0])
    expect(f[0]).toBeCloseTo(2 / 3, 8)
    expect(f[1]).toBeCloseTo(1 / 3, 8)
    // verify it truly balances: stake_i × decimal_i is constant
    expect(f[0] * 1.5).toBeCloseTo(f[1] * 3.0, 8)
  })

  it('plugging the balanced fractions into exposure yields a flat book', () => {
    const decimals = [1.4, 3.0, 9.0]
    const f = balancedStakeFractions(decimals)
    const positions = decimals.map((decimal, i) => ({ name: `O${i}`, decimal, stake: f[i] * 1000 }))
    expect(exposure(positions).balanced).toBe(true)
  })
})

describe('expectedHold', () => {
  it('equals the theoretical hold when money matches the prices', () => {
    // both sides 1.90 → 5% hold; balanced stakes; true probs 50/50
    const positions: BookPosition[] = [
      { name: 'A', decimal: 1.9, stake: 100 },
      { name: 'B', decimal: 1.9, stake: 100 },
    ]
    expect(expectedHold(positions, [0.5, 0.5])).toBeCloseTo(0.05, 6)
  })

  it('a fair (no-margin) book holds nothing in expectation', () => {
    const positions: BookPosition[] = [
      { name: 'A', decimal: 2, stake: 120 },
      { name: 'B', decimal: 2, stake: 80 },
    ]
    expect(expectedHold(positions, [0.5, 0.5])).toBeCloseTo(0, 6)
  })

  it('rejects true probabilities that do not sum to ~1', () => {
    const positions: BookPosition[] = [
      { name: 'A', decimal: 2, stake: 100 },
      { name: 'B', decimal: 2, stake: 100 },
    ]
    expect(() => expectedHold(positions, [0.4, 0.5])).toThrow(/sum/)
  })
})

describe('suggestLineMove', () => {
  it('returns null for an already-balanced book', () => {
    const positions: BookPosition[] = [
      { name: 'A', decimal: 2, stake: 100 },
      { name: 'B', decimal: 2, stake: 100 },
    ]
    expect(suggestLineMove(positions)).toBeNull()
  })

  it('shortens the over-exposed side and keeps the overround steady', () => {
    const positions: BookPosition[] = [
      { name: 'A', decimal: 2, stake: 150 },
      { name: 'B', decimal: 2, stake: 50 },
    ]
    const s = suggestLineMove(positions, 0.02)!
    expect(s.shorten).toBe('A')
    const moveA = s.moves.find((m) => m.name === 'A')!
    const moveB = s.moves.find((m) => m.name === 'B')!
    expect(moveA.to).toBeLessThan(moveA.from) // A shortened
    expect(moveB.to).toBeGreaterThan(moveB.from) // B lengthened
    // overround preserved
    const before = 1 / 2 + 1 / 2
    const after = 1 / moveA.to + 1 / moveB.to
    expect(after).toBeCloseTo(before, 6)
  })

  it('stays feasible on a lopsided market (no negative probs, no silent no-op)', () => {
    const positions: BookPosition[] = [
      { name: 'A', decimal: 1.01, stake: 1000 },
      { name: 'B', decimal: 1000, stake: 1 },
    ]
    const s = suggestLineMove(positions)!
    expect(s.shorten).toBe('A')
    const moveA = s.moves.find((m) => m.name === 'A')!
    const moveB = s.moves.find((m) => m.name === 'B')!
    expect(moveA.to).toBeLessThan(moveA.from) // actually shortened, not a no-op
    expect(moveB.to).toBeGreaterThan(moveB.from)
    for (const m of s.moves) expect(m.to).toBeGreaterThan(1) // every price valid
    const before = 1 / 1.01 + 1 / 1000
    const after = 1 / moveA.to + 1 / moveB.to
    expect(after).toBeCloseTo(before, 6) // overround preserved
  })
})
