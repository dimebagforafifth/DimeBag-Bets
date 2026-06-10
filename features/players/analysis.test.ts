import { describe, it, expect } from 'vitest'
import { createOrg, addPlayer } from '../../org/index.js'
import {
  clvPct,
  computePlayerClv,
  sharpness,
  suggestedMaxWager,
  rankByClv,
  type ClvBet,
} from './analysis.js'

const bet = (over: Partial<ClvBet>): ClvBet => ({
  playerId: 'p',
  sport: 'NFL',
  market: 'Spread',
  stake: 1000,
  priceTaken: 2.0,
  priceClose: 1.9,
  profit: 0,
  at: 0,
  ...over,
})

describe('CLV engine', () => {
  it('clvPct measures how much the taken price beat the close', () => {
    expect(clvPct(bet({ priceTaken: 2.0, priceClose: 1.8 }))).toBeCloseTo(11.111, 2)
    expect(clvPct(bet({ priceTaken: 1.8, priceClose: 2.0 }))).toBeCloseTo(-10, 2)
  })

  it('rolls bets into beat-line count, rate, points and handle', () => {
    const bets = [
      bet({ priceTaken: 2.0, priceClose: 1.8, stake: 1000, profit: 1000 }), // beat
      bet({ priceTaken: 1.5, priceClose: 1.6, stake: 1000, profit: -1000 }), // missed
    ]
    const r = computePlayerClv('p', 'Pat', bets, null)
    expect(r.totalBets).toBe(2)
    expect(r.beatLine).toBe(1)
    expect(r.beatRate).toBe(0.5)
    expect(r.points).toBe(0)
    expect(r.handle).toBe(2000)
  })

  it('sharpness rises with edge and shrinks toward 50 on small samples', () => {
    expect(sharpness(3, 1, 20)).toBe(100)
    expect(sharpness(-3, 0, 20)).toBe(0)
    expect(sharpness(0, 0.5, 20)).toBe(50)
    // a 2-bet read is pulled back toward 50 vs a 20-bet read of the same edge
    expect(sharpness(3, 1, 2)).toBeLessThan(sharpness(3, 1, 20))
    expect(sharpness(3, 1, 2)).toBeGreaterThan(50)
  })

  it('suggests tightening only for sharp, +EV players, and only when it lowers the cap', () => {
    expect(suggestedMaxWager(90, 2, 1000, 10_000)).toBe(5000) // 0.5×
    expect(suggestedMaxWager(60, 2, 1000, 10_000)).toBeNull() // not sharp enough
    expect(suggestedMaxWager(90, -1, 1000, 10_000)).toBeNull() // negative edge
    expect(suggestedMaxWager(90, 2, 1000, null)).toBeGreaterThan(0) // sets a first cap
    expect(suggestedMaxWager(72, 1, 100, 100)).toBeNull() // can't tighten below the floor
  })

  it('rankByClv sorts players and flips with direction', () => {
    const org = createOrg({ name: 'Book', creditLimit: 1_000_000_000, id: 'mgr' })
    addPlayer(org, 'mgr', { name: 'Sharp', creditLimit: 1_000_000, id: 'sharp' })
    addPlayer(org, 'mgr', { name: 'Square', creditLimit: 1_000_000, id: 'square' })
    const bets = [
      bet({ playerId: 'sharp', priceTaken: 2.2, priceClose: 1.9, profit: 1200 }),
      bet({ playerId: 'sharp', priceTaken: 2.1, priceClose: 1.95, profit: 1100 }),
      bet({ playerId: 'square', priceTaken: 1.7, priceClose: 2.0, profit: -1000 }),
      bet({ playerId: 'square', priceTaken: 1.6, priceClose: 1.9, profit: -1000 }),
    ]
    const desc = rankByClv(org, bets, 'sharpness', true)
    expect(desc.map((r) => r.playerId)).toEqual(['sharp', 'square'])
    const asc = rankByClv(org, bets, 'sharpness', false)
    expect(asc.map((r) => r.playerId)).toEqual(['square', 'sharp'])
  })
})
