import { describe, it, expect } from 'vitest'
import {
  RANK_ORDER,
  defaultRanks,
  defaultVipConfig,
  grantRewards,
  leaderboardRows,
  rankFor,
  rankProgress,
  setAutoGrant,
  setRankMinWagered,
  setRankReward,
  setReleased,
  unclaimedRewards,
  type PlayerVip,
} from './index.js'

const freshPlayer = (over: Partial<PlayerVip> = {}): PlayerVip => ({
  wagered: 0,
  claimedRanks: [],
  freePlay: 0,
  ...over,
})

describe('vip — ladder + defaults', () => {
  it('default ladder is ordered none..diamond with non-decreasing thresholds', () => {
    const ranks = defaultRanks()
    expect(ranks.map((r) => r.id)).toEqual(RANK_ORDER)
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i].minWagered).toBeGreaterThanOrEqual(ranks[i - 1].minWagered)
    }
  })

  it('default config: not released, auto-grant on, full ladder', () => {
    const c = defaultVipConfig()
    expect(c.released).toBe(false)
    expect(c.autoGrant).toBe(true)
    expect(c.ranks).toHaveLength(RANK_ORDER.length)
  })
})

describe('vip — rankFor', () => {
  const config = defaultVipConfig()

  it('is monotonic across the ladder and picks the right rank at boundaries', () => {
    expect(rankFor(0, config).id).toBe('none')
    expect(rankFor(99_999, config).id).toBe('none')
    // exactly at a threshold reaches that rank
    expect(rankFor(100_000, config).id).toBe('bronze')
    expect(rankFor(999_999, config).id).toBe('bronze')
    expect(rankFor(1_000_000, config).id).toBe('silver')
    expect(rankFor(5_000_000, config).id).toBe('gold')
    expect(rankFor(25_000_000, config).id).toBe('platinum')
    expect(rankFor(100_000_000, config).id).toBe('diamond')
    // beyond the top stays diamond
    expect(rankFor(500_000_000, config).id).toBe('diamond')
  })

  it('never regresses as wagered climbs', () => {
    let lastIdx = -1
    for (const w of [0, 100_000, 1_000_000, 5_000_000, 25_000_000, 100_000_000, 1e12]) {
      const idx = RANK_ORDER.indexOf(rankFor(w, config).id)
      expect(idx).toBeGreaterThanOrEqual(lastIdx)
      lastIdx = idx
    }
  })
})

describe('vip — rankProgress', () => {
  const config = defaultVipConfig()

  it('computes pct/remaining toward the next rank', () => {
    // halfway from bronze (100_000) to silver (1_000_000): span 900_000
    const half = rankProgress(550_000, config)
    expect(half.current.id).toBe('bronze')
    expect(half.next?.id).toBe('silver')
    expect(half.pct).toBeCloseTo(0.5, 6)
    expect(half.remaining).toBe(450_000)
  })

  it('at the very bottom measures toward bronze', () => {
    const p = rankProgress(0, config)
    expect(p.current.id).toBe('none')
    expect(p.next?.id).toBe('bronze')
    expect(p.pct).toBe(0)
    expect(p.remaining).toBe(100_000)
  })

  it('at the top rank next is null, pct 1, remaining 0', () => {
    const p = rankProgress(200_000_000, config)
    expect(p.current.id).toBe('diamond')
    expect(p.next).toBeNull()
    expect(p.pct).toBe(1)
    expect(p.remaining).toBe(0)
  })

  it('clamps pct into 0..1', () => {
    expect(rankProgress(100_000, config).pct).toBe(0) // exactly at bronze start
    expect(rankProgress(999_999, config).pct).toBeLessThan(1)
  })
})

describe('vip — grantRewards (idempotent)', () => {
  it('grants every reached reward once and a second call grants 0', () => {
    const config = defaultVipConfig()
    const pv = freshPlayer({ wagered: 1_200_000 }) // reached bronze + silver
    const first = grantRewards(pv, config)
    expect(first).toBe(500 + 2_000)
    expect(pv.freePlay).toBe(2_500)
    expect(pv.claimedRanks.sort()).toEqual(['bronze', 'silver'].sort())

    // idempotent: nothing new reached
    const second = grantRewards(pv, config)
    expect(second).toBe(0)
    expect(pv.freePlay).toBe(2_500)
  })

  it('does not grant rewards for ranks not yet reached', () => {
    const config = defaultVipConfig()
    const pv = freshPlayer({ wagered: 100_000 }) // bronze only
    expect(grantRewards(pv, config)).toBe(500)
    expect(pv.claimedRanks).toEqual(['bronze'])
  })

  it('none has no reward so claiming never happens for it', () => {
    const config = defaultVipConfig()
    const pv = freshPlayer({ wagered: 0 })
    expect(grantRewards(pv, config)).toBe(0)
    expect(pv.claimedRanks).toEqual([])
  })

  it('unclaimedRewards lists reached, rewardful, unclaimed ranks', () => {
    const config = defaultVipConfig()
    const pv = freshPlayer({ wagered: 1_200_000, claimedRanks: ['bronze'] })
    expect(unclaimedRewards(pv, config).map((r) => r.id)).toEqual(['silver'])
  })
})

describe('vip — leaderboardRows', () => {
  const config = defaultVipConfig()

  it('sorts by wagered desc with correct positions and ranks attached', () => {
    const rows = leaderboardRows(
      [
        { id: 'a', name: 'Ann', wagered: 100_000, freePlay: 0 },
        { id: 'b', name: 'Bo', wagered: 5_000_000, freePlay: 7_500 },
        { id: 'c', name: 'Cy', wagered: 0, freePlay: 0 },
      ],
      config,
    )
    expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'c'])
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3])
    expect(rows[0].rank.id).toBe('gold')
    expect(rows[1].rank.id).toBe('bronze')
    expect(rows[2].rank.id).toBe('none')
    expect(rows[1].freePlay).toBe(0)
  })

  it('does not mutate the input array', () => {
    const entries = [
      { id: 'a', name: 'Ann', wagered: 1, freePlay: 0 },
      { id: 'b', name: 'Bo', wagered: 2, freePlay: 0 },
    ]
    leaderboardRows(entries, config)
    expect(entries.map((e) => e.id)).toEqual(['a', 'b'])
  })
})

describe('vip — config setters', () => {
  it('setReleased / setAutoGrant toggle in place', () => {
    const c = defaultVipConfig()
    setReleased(c, true)
    expect(c.released).toBe(true)
    setAutoGrant(c, false)
    expect(c.autoGrant).toBe(false)
  })

  it('setRankReward re-prices a reward and rejects bad input', () => {
    const c = defaultVipConfig()
    setRankReward(c, 'bronze', 1_000)
    expect(c.ranks.find((r) => r.id === 'bronze')!.freePlayReward).toBe(1_000)
    expect(() => setRankReward(c, 'bronze', -1)).toThrow()
    expect(() => setRankReward(c, 'bronze', 1.5)).toThrow()
  })

  it('setRankMinWagered allows valid re-pricing within the band', () => {
    const c = defaultVipConfig()
    // silver between bronze (100_000) and gold (5_000_000)
    setRankMinWagered(c, 'silver', 2_000_000)
    expect(c.ranks.find((r) => r.id === 'silver')!.minWagered).toBe(2_000_000)
  })

  it('setRankMinWagered rejects breaking monotonicity', () => {
    const c = defaultVipConfig()
    // below bronze's threshold
    expect(() => setRankMinWagered(c, 'silver', 50_000)).toThrow(/monotonic/i)
    // above gold's threshold
    expect(() => setRankMinWagered(c, 'silver', 9_000_000)).toThrow(/monotonic/i)
    // non-integer / negative
    expect(() => setRankMinWagered(c, 'silver', -1)).toThrow()
    expect(() => setRankMinWagered(c, 'silver', 1.5)).toThrow()
  })

  it('lowering a threshold then rankFor reflects the new ladder', () => {
    const c = defaultVipConfig()
    setRankMinWagered(c, 'bronze', 0 + 100_000) // unchanged but valid
    setRankMinWagered(c, 'silver', 100_000) // silver now == bronze threshold
    // at 100_000, the highest reached rung is silver (last in order with min<=w)
    expect(rankFor(100_000, c).id).toBe('silver')
  })
})
