/**
 * The book activity store is the MANAGER SURFACE for the lane, and it's role-scoped:
 * a manager sees the whole book, an agent only their downline, a player only their
 * own — mirroring the org scoping the rest of the console uses. Plus the at-risk roll.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mockSlate } from './mockBook.js'
import { legFromSelection, type SlipLeg } from './slip.js'
import {
  recordBet,
  settleBetRecord,
  betsForViewer,
  atRiskCents,
  openBets,
  getBets,
  __resetBets,
  type BookBet,
} from './bets-store.js'

const slate = mockSlate()
const ev = slate[0]
const sampleLeg: SlipLeg = legFromSelection(ev, ev.markets[0], ev.markets[0].selections[0])

function bet(id: string, accountId: string, playerName: string, stakeCents = 5_000): BookBet {
  return {
    id,
    accountId,
    playerName,
    placedBy: playerName,
    mode: 'single',
    legs: [sampleLeg],
    stakeCents,
    decimal: sampleLeg.price.decimal,
    status: 'open',
    placedAt: 1,
  }
}

beforeEach(() => {
  __resetBets()
  recordBet(bet('b-marco', 'p-marco', 'Marco'))
  recordBet(bet('b-lena', 'p-lena', 'Lena'))
  recordBet(bet('b-tariq', 'p-tariq', 'Tariq'))
})

describe('role-scoped activity', () => {
  it('a manager sees the whole book', () => {
    const ids = betsForViewer('mgr', 'manager').map((b) => b.accountId)
    expect(ids.sort()).toEqual(['p-lena', 'p-marco', 'p-tariq'])
  })

  it('an agent sees only their downline', () => {
    // East Desk (a-e): Marco + Lena. NOT Tariq (West Desk).
    const east = betsForViewer('a-e', 'agent')
      .map((b) => b.accountId)
      .sort()
    expect(east).toEqual(['p-lena', 'p-marco'])
    expect(east).not.toContain('p-tariq')
    // West Desk (a-w): Tariq only.
    expect(betsForViewer('a-w', 'agent').map((b) => b.accountId)).toEqual(['p-tariq'])
  })

  it('a player sees only their own bets', () => {
    expect(betsForViewer('p-marco', 'player').map((b) => b.id)).toEqual(['b-marco'])
  })
})

describe('at-risk roll', () => {
  it('sums open stakes only', () => {
    expect(atRiskCents(getBets())).toBe(15_000) // 3 × 5,000 open
    settleBetRecord('b-marco', 'won', 9_500, 2)
    expect(openBets(getBets())).toHaveLength(2)
    expect(atRiskCents(getBets())).toBe(10_000) // 2 still open
  })
})
