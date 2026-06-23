import { describe, it, expect, beforeEach } from 'vitest'
import { placeWager, resolveWager, type Account } from '../../core/index.js'
import {
  __resetGamification,
  claimRewards,
  getPlayerState,
  recordPlay,
  settleTournament,
  spinWheel,
  tournamentStandings,
} from './store.js'

const acct = (id: string): Account => ({ id, creditLimit: 1_000_000_000, balance: 0, pending: 0 })
const NOW = Date.UTC(2026, 5, 7, 12, 0, 0)

describe('gamification engine', () => {
  beforeEach(() => __resetGamification())

  it('records play in real time from core wager events', () => {
    const a = acct('pl1')
    resolveWager(a, placeWager(a, 100), 'win', 2) // fires onWagerResolved → recordPlay
    const s = getPlayerState('pl1')
    expect(s.lifetimeBets).toBe(1)
    expect(s.lifetimeWins).toBe(1)
    expect(s.lifetimeWagered).toBe(100)
    expect(s.xp).toBeGreaterThan(0)
  })

  it('awards a completed mission + achievement as free-play through core, exactly once', () => {
    const a = acct('pl2')
    for (let i = 0; i < 3; i++) recordPlay('pl2', { stake: 100, profit: -100, outcome: 'loss' }, NOW)
    const before = a.balance
    const r = claimRewards(a, NOW)
    // daily-3-bets mission ($0.50) + first-bet achievement ($0.25)
    expect(r.cents).toBe(75)
    expect(r.items).toHaveLength(2)
    expect(a.balance).toBe(before + 75)
    // idempotent — nothing left to claim
    const again = claimRewards(a, NOW)
    expect(again.cents).toBe(0)
    expect(a.balance).toBe(before + 75)
  })

  it('spins the wheel for the picked segment, then is on cooldown (no double-award)', () => {
    const a = acct('pl3')
    const r = spinWheel(a, { now: NOW, serverSeed: 's', clientSeed: 'c', nonce: 1 })
    expect(r).not.toBeNull()
    expect(r!.cents).toBe(r!.segment.rewardCents)
    expect(a.balance).toBe(r!.cents)

    const blocked = spinWheel(a, { now: NOW + 60_000, serverSeed: 's', clientSeed: 'c', nonce: 2 })
    expect(blocked).toBeNull() // within 24h cooldown
    expect(a.balance).toBe(r!.cents)

    const next = spinWheel(a, { now: NOW + 24 * 3_600_000, serverSeed: 's', clientSeed: 'c', nonce: 3 })
    expect(next).not.toBeNull() // cooldown elapsed
  })

  it('ranks tournament players and pays the prize pool once', () => {
    const A = acct('A')
    const B = acct('B')
    const C = acct('C')
    recordPlay('A', { stake: 1000, profit: 0, outcome: 'loss' }, NOW)
    recordPlay('B', { stake: 3000, profit: 0, outcome: 'loss' }, NOW)
    recordPlay('C', { stake: 2000, profit: 0, outcome: 'loss' }, NOW)

    const st = tournamentStandings('weekly-wager-cup', { A: 'A', B: 'B', C: 'C' })
    expect(st.map((s) => s.id)).toEqual(['B', 'C', 'A']) // by wagered desc

    const payouts = settleTournament('weekly-wager-cup', { A, B, C }, NOW)
    // pool $100, split 50/30/20 → B $50, C $30, A $20
    expect(B.balance).toBe(5000)
    expect(C.balance).toBe(3000)
    expect(A.balance).toBe(2000)
    expect(payouts).toHaveLength(3)

    // settling again pays no one twice
    const again = settleTournament('weekly-wager-cup', { A, B, C }, NOW)
    expect(again).toHaveLength(0)
    expect(B.balance).toBe(5000)
  })
})
