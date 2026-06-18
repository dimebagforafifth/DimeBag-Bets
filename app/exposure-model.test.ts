/**
 * Consolidated exposure + correlated-downside math (CLAUDE.md §4). Pure over hand-built
 * BookBets so the liability arithmetic is deterministic — liability = the book's payout if
 * an OPEN bet wins (player profit), attributed to every dimension it touches.
 */
import { describe, it, expect } from 'vitest'
import {
  betLiability,
  betType,
  consolidatedExposure,
  exposureByAgent,
  isChalkLeg,
  winsUnderChalk,
  correlatedDownside,
} from './exposure.js'
import { getBook } from './book-store.js'
import type { BookBet } from './book/bets-store.js'
import type { SlipLeg } from './book/slip.js'

function leg(over: Partial<SlipLeg> = {}): SlipLeg {
  return {
    key: over.key ?? `${over.eventId ?? 'E1'}-${over.side ?? 'home'}`,
    eventId: 'E1',
    eventLabel: 'Away @ Home',
    leagueId: 'NBA',
    marketId: 'E1-ml',
    marketType: 'moneyline',
    marketPeriod: 'game',
    side: 'home',
    pick: 'Home ML',
    price: { american: -110, decimal: 2.0 },
    sport: 'BASKETBALL',
    trueProb: 0.6,
    ...over,
  }
}
function bet(over: Partial<BookBet> = {}): BookBet {
  return {
    id: over.id ?? 'b1',
    accountId: 'p1',
    playerName: 'P1',
    placedBy: 'P1',
    mode: 'single',
    legs: [leg()],
    stakeCents: 10_000,
    decimal: 2.0,
    status: 'open',
    placedAt: 0,
    ...over,
  }
}

describe('betLiability + betType', () => {
  it('liability = payout − stake on an OPEN bet; 0 once settled/cashed', () => {
    expect(betLiability(bet({ stakeCents: 10_000, decimal: 2.0 }))).toBe(10_000)
    expect(betLiability(bet({ stakeCents: 5_000, decimal: 4.0 }))).toBe(15_000)
    expect(betLiability(bet({ status: 'won' }))).toBe(0)
    expect(betLiability(bet({ status: 'cashed' }))).toBe(0)
  })
  it('classifies single / cross-game parlay / same-game parlay', () => {
    expect(betType(bet())).toBe('single')
    const xLegs = [leg({ eventId: 'E1', key: 'a' }), leg({ eventId: 'E2', key: 'b' })]
    expect(betType(bet({ mode: 'parlay', legs: xLegs }))).toBe('parlay')
    const sgpLegs = [leg({ eventId: 'E1', key: 'a' }), leg({ eventId: 'E1', marketId: 'E1-tot', key: 'b' })]
    expect(betType(bet({ mode: 'parlay', legs: sgpLegs }))).toBe('sgp')
  })
})

describe('consolidatedExposure', () => {
  it('aggregates liability by event/player/bet-type, attributing a parlay to each event', () => {
    const A = bet({ id: 'A', accountId: 'p1', stakeCents: 10_000, decimal: 2.0, legs: [leg({ eventId: 'E1', key: 'a' })] })
    const B = bet({
      id: 'B',
      accountId: 'p2',
      mode: 'parlay',
      stakeCents: 5_000,
      decimal: 4.0, // liability 15_000
      legs: [leg({ eventId: 'E1', key: 'b1' }), leg({ eventId: 'E2', eventLabel: 'X @ Y', key: 'b2' })],
    })
    const x = consolidatedExposure([A, B])
    expect(x.totalLiabilityCents).toBe(25_000) // 10k + 15k, each bet once
    expect(x.openBetCount).toBe(2)
    // E1 carries A + B's full payout; E2 only B
    expect(x.byEvent.find((r) => r.key === 'E1')?.liabilityCents).toBe(25_000)
    expect(x.byEvent.find((r) => r.key === 'E2')?.liabilityCents).toBe(15_000)
    expect(x.byPlayer.find((r) => r.key === 'p1')?.liabilityCents).toBe(10_000)
    expect(x.byBetType.find((r) => r.key === 'single')?.liabilityCents).toBe(10_000)
    expect(x.byBetType.find((r) => r.key === 'parlay')?.liabilityCents).toBe(15_000)
    expect(x.byEvent[0].key).toBe('E1') // sorted by liability desc
  })

  it('ignores settled bets and dedupes a key shared by two legs of one bet', () => {
    const settled = bet({ id: 'S', status: 'won' })
    // a (degenerate) two-leg bet both on E1 → counted once for E1
    const twoOnE1 = bet({
      id: 'T',
      mode: 'parlay',
      decimal: 3.0,
      stakeCents: 10_000, // liability 20_000
      legs: [leg({ eventId: 'E1', marketId: 'E1-ml', key: 't1' }), leg({ eventId: 'E1', marketId: 'E1-tot', key: 't2' })],
    })
    const x = consolidatedExposure([settled, twoOnE1])
    expect(x.openBetCount).toBe(1)
    const e1 = x.byEvent.find((r) => r.key === 'E1')!
    expect(e1.liabilityCents).toBe(20_000)
    expect(e1.betCount).toBe(1) // not 2 — one bet, even though both legs are on E1
  })
})

describe('exposureByAgent (rolled up the tree)', () => {
  it('rolls each player’s liability into every ancestor agent/manager', () => {
    const org = getBook() // seeded: mgr > sa-n > a-e > {p-marco, p-lena}; mgr > sa-s > a-w > p-tariq
    const bets = [
      bet({ id: 'm', accountId: 'p-marco', stakeCents: 10_000, decimal: 2.0 }), // 10k
      bet({ id: 't', accountId: 'p-tariq', stakeCents: 10_000, decimal: 3.0 }), // 20k
    ]
    const rows = exposureByAgent(org, bets)
    const by = (id: string) => rows.find((r) => r.key === id)?.liabilityCents
    expect(by('a-e')).toBe(10_000) // only p-marco's bet
    expect(by('a-w')).toBe(20_000) // only p-tariq's bet
    expect(by(org.managerId)).toBe(30_000) // manager sees the whole tree
  })
})

describe('correlated downside (chalk day)', () => {
  it('isChalkLeg uses trueProb (fallback implied) — favourite/over ≥ 0.5', () => {
    expect(isChalkLeg(leg({ trueProb: 0.6 }))).toBe(true)
    expect(isChalkLeg(leg({ trueProb: 0.4 }))).toBe(false)
    expect(isChalkLeg(leg({ trueProb: undefined, price: { american: -200, decimal: 1.5 } }))).toBe(true)
    expect(isChalkLeg(leg({ trueProb: undefined, price: { american: 200, decimal: 3.0 } }))).toBe(false)
  })

  it('sums the worst case where every favourite/over lands (chalk parlays blow up together)', () => {
    const chalkParlay = bet({
      id: 'C',
      mode: 'parlay',
      stakeCents: 10_000,
      decimal: 5.0, // liability 40_000
      legs: [leg({ eventId: 'E1', key: 'c1', trueProb: 0.7 }), leg({ eventId: 'E2', key: 'c2', trueProb: 0.65 })],
    })
    const mixed = bet({
      id: 'D',
      mode: 'parlay',
      stakeCents: 10_000,
      decimal: 5.0,
      legs: [leg({ eventId: 'E1', key: 'd1', trueProb: 0.7 }), leg({ eventId: 'E3', key: 'd2', trueProb: 0.3 })], // a dog leg
    })
    const chalkSingle = bet({ id: 'E', stakeCents: 5_000, decimal: 2.0, legs: [leg({ eventId: 'E4', key: 'e1', trueProb: 0.8 })] }) // 5_000

    expect(winsUnderChalk(chalkParlay)).toBe(true)
    expect(winsUnderChalk(mixed)).toBe(false) // a dog leg can't land on a chalk day
    const cd = correlatedDownside([chalkParlay, mixed, chalkSingle])
    expect(cd.chalkLiabilityCents).toBe(45_000) // 40k + 5k; the mixed parlay excluded
    expect(cd.chalkBetCount).toBe(2)
    expect(cd.worstEvent?.key).toBe('E1') // the most-exposed chalk event
  })

  it('surfaces SGP clusters with the sport correlation (consuming C’s model)', () => {
    const sgp = bet({
      id: 'S',
      mode: 'parlay',
      stakeCents: 10_000,
      decimal: 3.0,
      legs: [
        leg({ eventId: 'E1', marketId: 'E1-ml', key: 's1', sport: 'BASKETBALL', trueProb: 0.6 }),
        leg({ eventId: 'E1', marketId: 'E1-tot', key: 's2', sport: 'BASKETBALL', trueProb: 0.55 }),
      ],
    })
    const cd = correlatedDownside([sgp])
    expect(cd.sgpClusters).toHaveLength(1)
    expect(cd.sgpClusters[0].eventId).toBe('E1')
    expect(cd.sgpClusters[0].rho).toBeGreaterThan(0) // correlationForSport('BASKETBALL')
    expect(cd.sgpClusters[0].liabilityCents).toBe(20_000)
  })
})
