/**
 * Public splits — the scoped read side. Scope respects downline vs global over the demo org
 * tree (mgr → sa-n → a-e → {marco, lena}; mgr → sa-s → a-w → tariq), voids are excluded, and a
 * viewer outside the tree falls back to the tenant board. Reads recorded bets; moves no money.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __resetBets, recordBet, type BookBet } from '../../app/book/bets-store.js'
import type { SlipLeg } from '../../app/book/slip.js'
import { __resetCommunitySettings } from '../profile/community-settings.js'
import { marketSplitsFor, mostBetMarketsFor, scopedSplitBets, viewerHasDownline } from './source.js'

const leg = (marketId: string, side: string): SlipLeg => ({
  key: `${marketId}:${side}`,
  eventId: 'e1',
  eventLabel: 'Away @ Home',
  leagueId: 'NBA',
  marketId,
  marketType: 'moneyline',
  marketPeriod: 'game',
  side,
  pick: side,
  price: { american: -110, decimal: 1.91 },
  sport: 'BASKETBALL',
})

const bet = (
  id: string,
  accountId: string,
  marketId: string,
  side: string,
  status: BookBet['status'] = 'open',
): BookBet => ({
  id,
  accountId,
  playerName: accountId,
  placedBy: accountId,
  mode: 'single',
  legs: [leg(marketId, side)],
  stakeCents: 1_000,
  decimal: 1.91,
  status,
  placedAt: 0,
})

beforeEach(() => {
  __resetBets()
  __resetCommunitySettings()
})
afterEach(() => {
  __resetBets()
  __resetCommunitySettings()
})

describe('scope respects downline vs global', () => {
  beforeEach(() => {
    recordBet(bet('marco-1', 'p-marco', 'm-marco', 'home')) // under a-e / sa-n
    recordBet(bet('tariq-1', 'p-tariq', 'm-tariq', 'home')) // under a-w / sa-s
  })

  it('global sees the whole tenant’s action', () => {
    const markets = marketSplitsFor('a-e', 'global')
    expect(markets.has('m-marco')).toBe(true)
    expect(markets.has('m-tariq')).toBe(true)
  })

  it('an agent’s downline sees only their subtree', () => {
    const eastMarkets = marketSplitsFor('a-e', 'downline')
    expect(eastMarkets.has('m-marco')).toBe(true) // marco is under a-e
    expect(eastMarkets.has('m-tariq')).toBe(false) // tariq is not

    const southMarkets = marketSplitsFor('sa-s', 'downline')
    expect(southMarkets.has('m-tariq')).toBe(true) // tariq is under sa-s
    expect(southMarkets.has('m-marco')).toBe(false)
  })

  it('the manager’s downline is the whole book', () => {
    const markets = marketSplitsFor('mgr', 'downline')
    expect(markets.has('m-marco')).toBe(true)
    expect(markets.has('m-tariq')).toBe(true)
  })

  it('a viewer outside the org tree falls back to the tenant board', () => {
    const rows = scopedSplitBets('not-in-tree', 'downline')
    expect(rows.map((r) => r.marketId).sort()).toEqual(['m-marco', 'm-tariq'])
  })
})

describe('viewerHasDownline (whether to offer the toggle)', () => {
  it('is true for staff with a subtree, false for a leaf player', () => {
    expect(viewerHasDownline('mgr')).toBe(true)
    expect(viewerHasDownline('a-e')).toBe(true)
    expect(viewerHasDownline('p-marco')).toBe(false) // a player has no downline
    expect(viewerHasDownline('ghost')).toBe(false) // not in the tree
  })
})

describe('voids carry no betting interest', () => {
  it('excludes voided bets from the split', () => {
    recordBet(bet('open-1', 'p-marco', 'mx', 'home', 'open'))
    recordBet(bet('void-1', 'p-lena', 'mx', 'away', 'void'))
    const split = marketSplitsFor('mgr', 'global').get('mx')!
    expect(split.totalTickets).toBe(1) // only the open bet
    expect(split.sides.every((s) => s.side !== 'away')).toBe(true)
  })
})

describe('most-bet, scoped', () => {
  it('ranks within the scope', () => {
    recordBet(bet('m1', 'p-marco', 'mkt-a', 'home'))
    recordBet(bet('m2', 'p-lena', 'mkt-a', 'away')) // lena also under a-e
    recordBet(bet('t1', 'p-tariq', 'mkt-b', 'home'))
    const east = mostBetMarketsFor('a-e', 'downline', { by: 'tickets' })
    expect(east.map((r) => r.split.marketId)).toEqual(['mkt-a']) // tariq's market is out of scope
    const all = mostBetMarketsFor('mgr', 'global', { by: 'tickets' })
    expect(all.map((r) => r.split.marketId).sort()).toEqual(['mkt-a', 'mkt-b'])
  })
})
