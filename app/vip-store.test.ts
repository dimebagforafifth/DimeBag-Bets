import { describe, it, expect } from 'vitest'
import { placeWager, resolveWager, type Account } from '../core/index.js'
import {
  getPlayerVip,
  getVipConfig,
  getVipVersion,
  grantFreePlay,
  leaderboard,
  mutateVipConfig,
  subscribeVip,
  takeFreePlay,
} from './vip-store.js'
import { setAutoGrant } from '../vip/index.js'

/**
 * The VIP store subscribes to core's onWagerResolved, so a real wager driven
 * through core (placeWager + resolveWager) must accrue to the player's lifetime
 * wagered and auto-grant the matching rank reward into free play. These tests
 * exercise the live singleton, so they run in declared order.
 */

const freshAccount = (): Account => ({ id: 'p1', creditLimit: 1_000_000_00, balance: 0, pending: 0 })

describe('vip-store — play accrues + auto-grants', () => {
  it('a real wager through core accumulates wagered and auto-grants the rank reward', () => {
    const acct = freshAccount()
    const before = getPlayerVip('p1')
    expect(before.wagered).toBe(0)
    expect(before.freePlay).toBe(0)

    // $1,000 wagered (100_000 cents) — exactly the bronze threshold.
    const w = placeWager(acct, 100_000)
    resolveWager(acct, w, 'loss')

    const pv = getPlayerVip('p1')
    expect(pv.wagered).toBe(100_000)
    // auto-grant is on by default → bronze reward ($5 = 500 cents) landed
    expect(pv.claimedRanks).toContain('bronze')
    expect(pv.freePlay).toBe(500)
  })

  it('further wagering keeps accruing and grants higher ranks once', () => {
    const acct = freshAccount()
    acct.pending = 0
    // push wagered up to silver: need 1_000_000 total; already 100_000 → +900_000
    const w = placeWager(acct, 900_000)
    resolveWager(acct, w, 'win', 2)

    const pv = getPlayerVip('p1')
    expect(pv.wagered).toBe(1_000_000)
    expect(pv.claimedRanks).toEqual(expect.arrayContaining(['bronze', 'silver']))
    // bronze 500 + silver 2_000
    expect(pv.freePlay).toBe(2_500)
  })

  it('every resolution bumps the version + notifies', () => {
    const acct = freshAccount()
    let notified = 0
    const unsub = subscribeVip(() => {
      notified++
    })
    const v0 = getVipVersion()
    const w = placeWager(acct, 1_000)
    resolveWager(acct, w, 'push')
    expect(getVipVersion()).toBeGreaterThan(v0)
    expect(notified).toBeGreaterThan(0)
    unsub()
  })

  it('takeFreePlay zeroes the pool and returns the cents to redeem', () => {
    const pv = getPlayerVip('p1')
    const owed = pv.freePlay
    expect(owed).toBeGreaterThan(0)
    const taken = takeFreePlay('p1')
    expect(taken).toBe(owed)
    expect(getPlayerVip('p1').freePlay).toBe(0)
  })

  it('grantFreePlay adds a manual manager grant', () => {
    grantFreePlay('p1', 1_000)
    expect(getPlayerVip('p1').freePlay).toBe(1_000)
  })

  it('leaderboard builds positioned rows from player VIP records', () => {
    getPlayerVip('p2') // ensure a zeroed second player (wagered 0)
    const rows = leaderboard([
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ])
    expect(rows.map((r) => r.id)).toEqual(['p1', 'p2']) // p1 has wagered more
    expect(rows.map((r) => r.position)).toEqual([1, 2])
    expect(rows[0].rank.id).toBe('silver')
  })

  it('mutateVipConfig re-grants when a threshold drops (auto-grant on)', () => {
    // p2 has wagered 0 — give it some wagered below silver but lower the bar
    const acct: Account = { id: 'p2', creditLimit: 1_000_000_00, balance: 0, pending: 0 }
    const w = placeWager(acct, 200_000) // $2,000 — bronze only
    resolveWager(acct, w, 'loss')
    const beforeBronze = getPlayerVip('p2').freePlay // bronze 500 auto-granted

    // drop silver's threshold to 150_000 so p2 (200_000) now reaches it
    mutateVipConfig((c) => {
      c.ranks.find((r) => r.id === 'silver')!.minWagered = 150_000
    })
    const pv = getPlayerVip('p2')
    expect(pv.claimedRanks).toEqual(expect.arrayContaining(['bronze', 'silver']))
    expect(pv.freePlay).toBe(beforeBronze + 2_000)
  })

  it('with auto-grant off, play accrues wagered but does NOT auto-grant', () => {
    setAutoGrant(getVipConfig(), false)
    const acct: Account = { id: 'p3', creditLimit: 1_000_000_00, balance: 0, pending: 0 }
    const w = placeWager(acct, 100_000) // reaches bronze
    resolveWager(acct, w, 'loss')
    const pv = getPlayerVip('p3')
    expect(pv.wagered).toBe(100_000)
    expect(pv.freePlay).toBe(0)
    expect(pv.claimedRanks).toEqual([])
    setAutoGrant(getVipConfig(), true) // restore
  })
})
