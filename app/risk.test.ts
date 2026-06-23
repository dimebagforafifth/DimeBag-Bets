import { describe, it, expect } from 'vitest'
import { createOrg, addPlayer, type Org } from '../features/org/index.js'
import type { BetRow } from './ledger-stats.js'
import { bookHold, holdByGame, winnersLosers, checkAlerts } from './risk.js'

function row(over: Partial<BetRow> = {}): BetRow {
  return { id: 1, accountId: 'p', gameKey: 'mines', game: 'Mines', stake: 1000, multiplier: 0, profit: -1000, outcome: 'loss', time: 0, ...over }
}

describe('risk analytics', () => {
  it('bookHold: book wins what players lose', () => {
    const rows = [
      row({ stake: 1000, profit: -1000 }), // player lost 1000 → book +1000
      row({ stake: 1000, profit: 500 }), // player won 500 → book −500
    ]
    expect(bookHold(rows)).toEqual({ handle: 2000, bookNet: 500, hold: 0.25, bets: 2 })
  })

  it('excludes voids (no action) from handle and net', () => {
    const rows = [
      row({ stake: 1000, profit: -1000, outcome: 'loss' }), // book +1000, handle 1000
      row({ stake: 5000, profit: 0, outcome: 'void' }), // no action — excluded entirely
    ]
    expect(bookHold(rows)).toEqual({ handle: 1000, bookNet: 1000, hold: 1, bets: 1 })
  })

  it('holdByGame groups + sorts by handle, computing per-game hold', () => {
    const rows = [
      row({ gameKey: 'dice', game: 'Dice', stake: 3000, profit: -600 }), // book +600
      row({ gameKey: 'mines', game: 'Mines', stake: 1000, profit: 1000 }), // book −1000
    ]
    const g = holdByGame(rows)
    expect(g.map((x) => x.key)).toEqual(['dice', 'mines']) // bigger handle first
    expect(g[0]).toMatchObject({ key: 'dice', handle: 3000, bookNet: 600, hold: 0.2 })
    expect(g[1]).toMatchObject({ key: 'mines', bookNet: -1000, hold: -1 }) // a losing game
  })

  it('winnersLosers ranks players by live figure', () => {
    const org = seed()
    const { winners, losers } = winnersLosers(org, 2)
    expect(winners.map((w) => w.id)).toEqual(['up2', 'up1']) // highest first
    expect(losers.map((l) => l.id)).toEqual(['down']) // only one in the red
  })

  it('checkAlerts flags high credit utilization and an exposure breach', () => {
    const org = seed()
    const money = (c: number) => `$${c}`
    // down player is at 100% (balance -10000, limit 10000), up players at 0
    const alerts = checkAlerts(org, { creditUtil: 0.8, exposureCap: null }, money)
    expect(alerts.some((a) => a.message.includes('100% of credit'))).toBe(true)

    org.members.down.account.pending = 50_000 // exposure now 50000
    const withCap = checkAlerts(org, { creditUtil: 0.8, exposureCap: 10_000 }, money)
    expect(withCap.some((a) => a.message.includes('over the $10000 cap'))).toBe(true)
  })
})

function seed(): Org {
  const org = createOrg({ name: 'House', id: 'mgr', creditLimit: 1_000_000 })
  const up1 = addPlayer(org, 'mgr', { name: 'Up1', id: 'up1', creditLimit: 10_000 })
  const up2 = addPlayer(org, 'mgr', { name: 'Up2', id: 'up2', creditLimit: 10_000 })
  const down = addPlayer(org, 'mgr', { name: 'Down', id: 'down', creditLimit: 10_000 })
  up1.account.balance = 3_000
  up2.account.balance = 8_000
  down.account.balance = -10_000
  return org
}
