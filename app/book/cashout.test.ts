/**
 * Cash-out: the live offer is win-prob × potential payout − a house margin, and settling
 * it runs through the SAME `core` money model — a full cash closes the wager at the offer,
 * a partial cashes part now and leaves the rest riding. Credit/balance only, integer cents.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { getBook } from '../book-store.js'
import { resetBookOdds, getBookOddsSnapshot } from './odds-source.js'
import { legFromSelection, type SlipLeg } from './slip.js'
import { placeBookBet, settleBookBet, cashOutBookBet, __resetPlacement } from './placement.js'
import { getBets, __resetBets } from './bets-store.js'
import { cashOutQuote, cashOutMath, liveWinProbability, DEFAULT_CASHOUT_MARGIN } from './cashout.js'
import { toReturnCents } from './odds-format.js'

const NOW = 1_750_000_000_000

function acct(id: string) {
  return getBook().members[id].account
}
function events() {
  return getBookOddsSnapshot().events
}
function leg(eventIdx: number, type: SlipLeg['marketType'], selIdx: number): SlipLeg {
  const e = events()[eventIdx]
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
  for (const m of Object.values(getBook().members)) m.account.pending = 0
})

describe('cashOutMath — the integer-cents split (pure)', () => {
  it('a full cash-out closes the whole stake at the offer', () => {
    const m = cashOutMath(7_000, 10_000, 1)
    expect(m.keptStakeCents).toBe(0)
    expect(m.cashedValueCents).toBe(7_000)
    // resolveAtMultiplier(m) moves the figure by stake×(mult−1) = 7000−10000 = −3000
    expect(10_000 * (m.multiplier - 1)).toBeCloseTo(-3_000, 6)
  })

  it('a half cash-out keeps half the stake and cashes half the offer', () => {
    const m = cashOutMath(8_000, 10_000, 0.5)
    expect(m.keptStakeCents).toBe(5_000)
    expect(m.cashedValueCents).toBe(4_000)
    // figure moves by cashedValue − cashedStake = 4000 − 5000 = −1000
    expect(Math.round(10_000 * (m.multiplier - 1))).toBe(-1_000)
  })
})

describe('cashOutQuote — value from the live slate', () => {
  it('offers win-prob × potential payout minus the cash-out margin', () => {
    const [bet] = place('p-lena', [leg(0, 'moneyline', 0)], 'single', 10_000)
    const q = cashOutQuote(getBets().find((b) => b.id === bet.id)!, events())
    const p = liveWinProbability(getBets()[0], events())!
    expect(q.cashable).toBe(true)
    expect(q.winProbability).toBeCloseTo(p, 9)
    expect(q.offerCents).toBe(
      Math.round(toReturnCents(10_000, bet.decimal) * p * (1 - DEFAULT_CASHOUT_MARGIN)),
    )
    expect(q.offerCents).toBeLessThan(q.potentialReturnCents)
  })

  it('is not cashable when a leg is no longer on the board', () => {
    const [bet] = place('p-lena', [leg(0, 'moneyline', 0)], 'single', 10_000)
    const q = cashOutQuote(getBets().find((b) => b.id === bet.id)!, []) // empty slate
    expect(q.cashable).toBe(false)
    expect(q.offerCents).toBe(0)
  })
})

describe('full cash-out — settles through core', () => {
  it('closes the wager at the offer and moves the figure by offer − stake', () => {
    const a = acct('p-lena')
    const before = a.balance
    const [bet] = place('p-lena', [leg(0, 'moneyline', 0)], 'single', 10_000)
    const q = cashOutQuote(getBets().find((b) => b.id === bet.id)!, events())

    const res = cashOutBookBet(bet.id, events(), { now: NOW })
    expect(res).not.toBeNull()
    expect(res!.fullyClosed).toBe(true)
    expect(res!.cashedValueCents).toBe(q.offerCents)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(before + (q.offerCents - 10_000))

    const settled = getBets().find((b) => b.id === bet.id)!
    expect(settled.status).toBe('cashed')
    expect(settled.returnCents).toBe(q.offerCents)
  })

  it('returns null for an already-settled bet (no double settle)', () => {
    const [bet] = place('p-lena', [leg(0, 'moneyline', 0)], 'single', 10_000)
    cashOutBookBet(bet.id, events(), { now: NOW })
    expect(cashOutBookBet(bet.id, events(), { now: NOW })).toBeNull()
  })
})

describe('partial cash-out — bank some now, let the rest ride', () => {
  it('cashes half now and keeps half live, then settles the remainder', () => {
    const a = acct('p-priya')
    const before = a.balance
    const [bet] = place('p-priya', [leg(0, 'moneyline', 0)], 'single', 10_000)
    const decimal = bet.decimal
    const q = cashOutQuote(getBets().find((b) => b.id === bet.id)!, events())
    const m = cashOutMath(q.offerCents, 10_000, 0.5)

    const res = cashOutBookBet(bet.id, events(), { fraction: 0.5, now: NOW })
    expect(res!.fullyClosed).toBe(false)
    expect(res!.keptStakeCents).toBe(5_000)

    // figure moved by the cashed portion's P/L; the kept stake is re-held in pending
    expect(a.balance).toBe(before + (m.cashedValueCents - 5_000))
    expect(a.pending).toBe(5_000)

    const rec = getBets().find((b) => b.id === bet.id)!
    expect(rec.status).toBe('open')
    expect(rec.stakeCents).toBe(5_000)
    expect(rec.cashedOutCents).toBe(m.cashedValueCents)

    // the remaining 5,000 rides and wins at the original price
    settleBookBet(bet.id, { [bet.legs[0].key]: 'win' }, NOW)
    const won = getBets().find((b) => b.id === bet.id)!
    expect(won.status).toBe('won')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(
      before + (m.cashedValueCents - 5_000) + Math.round(5_000 * (decimal - 1)),
    )
  })
})
