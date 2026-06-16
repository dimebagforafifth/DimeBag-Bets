/**
 * Placement + settlement run through the SHARED `core` money model: placing holds
 * the stake in `pending` (figure unchanged), settling releases it and moves the
 * figure. Parlays price off the locked decimals and RE-PRICE when a leg voids
 * (CLAUDE.md §4). Over-available is refused, placing nothing. Integer cents only.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { availableToWager } from '../../core/index.js'
import { getBook } from '../book-store.js'
import { resetBookOdds, getBookOddsSnapshot } from './odds-source.js'
import { legFromSelection, parlayPrice, type SlipLeg } from './slip.js'
import { placeBookBet, settleBookBet, __resetPlacement } from './placement.js'
import { getBets, __resetBets } from './bets-store.js'

const NOW = 1_750_000_000_000

function acct(id: string) {
  return getBook().members[id].account
}
function leg(eventIdx: number, type: SlipLeg['marketType'], selIdx: number): SlipLeg {
  const e = getBookOddsSnapshot().events[eventIdx]
  const m = e.markets.find((mk) => mk.type === type)!
  return legFromSelection(e, m, m.selections[selIdx])
}
function place(id: string, legs: SlipLeg[], mode: 'single' | 'parlay', stakeCents: number) {
  const m = getBook().members[id]
  return placeBookBet({
    account: m.account,
    playerName: m.name,
    placedBy: m.name,
    legs,
    mode,
    stakeCents,
    now: NOW,
  })
}

beforeEach(() => {
  __resetBets()
  __resetPlacement()
  resetBookOdds()
  // a reload-clean baseline: no stale holds
  for (const m of Object.values(getBook().members)) m.account.pending = 0
})

describe('single bet — place holds pending, settle moves the figure', () => {
  it('placing holds the stake without moving the figure', () => {
    const a = acct('p-lena')
    const before = a.balance
    const [bet] = place('p-lena', [leg(0, 'moneyline', 0)], 'single', 10_000)
    expect(a.pending).toBe(10_000)
    expect(a.balance).toBe(before) // figure unchanged until graded
    expect(availableToWager(a)).toBe(a.creditLimit + a.balance - 10_000)
    expect(bet.status).toBe('open')
    expect(getBets()).toHaveLength(1)
  })

  it('a win pays profit = stake × (decimal − 1) and returns the stake to pending', () => {
    const a = acct('p-lena')
    const l = leg(0, 'moneyline', 0)
    const before = a.balance
    const [bet] = place('p-lena', [l], 'single', 10_000)
    settleBookBet(bet.id, { [l.key]: 'win' }, NOW)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(before + Math.round(10_000 * (l.price.decimal - 1)))
    const settled = getBets().find((b) => b.id === bet.id)!
    expect(settled.status).toBe('won')
    expect(settled.returnCents).toBe(Math.round(10_000 * l.price.decimal))
  })

  it('a loss takes the stake from the figure', () => {
    const a = acct('p-lena')
    const l = leg(0, 'moneyline', 0)
    const before = a.balance
    const [bet] = place('p-lena', [l], 'single', 8_000)
    settleBookBet(bet.id, { [l.key]: 'loss' }, NOW)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(before - 8_000)
    expect(getBets().find((b) => b.id === bet.id)!.status).toBe('lost')
  })

  it('a push returns the stake, figure unchanged', () => {
    const a = acct('p-lena')
    const l = leg(0, 'moneyline', 0)
    const before = a.balance
    const [bet] = place('p-lena', [l], 'single', 6_000)
    settleBookBet(bet.id, { [l.key]: 'push' }, NOW)
    expect(a.balance).toBe(before)
    const settled = getBets().find((b) => b.id === bet.id)!
    expect(settled.status).toBe('push')
    expect(settled.returnCents).toBe(6_000)
  })
})

describe('parlay — combined price, re-price on void, any-loss loses', () => {
  it('a winning parlay pays the combined decimal', () => {
    const a = acct('p-priya')
    const legs = [leg(0, 'moneyline', 0), leg(1, 'moneyline', 0)]
    const before = a.balance
    const [bet] = place('p-priya', legs, 'parlay', 5_000)
    expect(a.pending).toBe(5_000) // ONE hold for the parlay
    const decimal = parlayPrice(legs)
    settleBookBet(bet.id, {}, NOW) // all legs win by default
    expect(a.balance).toBe(before + Math.round(5_000 * (decimal - 1)))
  })

  it('a void leg drops out and the parlay re-prices on the survivor', () => {
    const a = acct('p-priya')
    const legs = [leg(0, 'moneyline', 0), leg(1, 'moneyline', 0)]
    const before = a.balance
    const [bet] = place('p-priya', legs, 'parlay', 5_000)
    settleBookBet(bet.id, { [legs[0].key]: 'void' }, NOW) // leg 1 still wins
    expect(a.balance).toBe(before + Math.round(5_000 * (legs[1].price.decimal - 1)))
    expect(getBets().find((b) => b.id === bet.id)!.status).toBe('won')
  })

  it('one losing leg loses the whole parlay', () => {
    const a = acct('p-priya')
    const legs = [leg(0, 'moneyline', 0), leg(1, 'moneyline', 0)]
    const before = a.balance
    const [bet] = place('p-priya', legs, 'parlay', 5_000)
    settleBookBet(bet.id, { [legs[0].key]: 'loss' }, NOW)
    expect(a.balance).toBe(before - 5_000)
    expect(getBets().find((b) => b.id === bet.id)!.status).toBe('lost')
  })
})

describe('limits', () => {
  it('refuses a stake beyond availableToWager and places nothing', () => {
    const a = acct('p-tariq') // available = 200,000 + (−120,000) = 80,000
    const before = { balance: a.balance, pending: a.pending }
    expect(() => place('p-tariq', [leg(0, 'moneyline', 0)], 'single', 1_000_000)).toThrow(
      /available/i,
    )
    expect(a.balance).toBe(before.balance)
    expect(a.pending).toBe(before.pending)
    expect(getBets()).toHaveLength(0)
  })
})
