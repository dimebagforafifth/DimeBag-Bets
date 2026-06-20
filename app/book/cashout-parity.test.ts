/**
 * Cash-out PARITY for SGP / bet-builder tickets + the Round-2 gate:
 *  - a same-game ticket cashes out (full + partial) through the SAME core path a single does,
 *    pricing the offer off the SGP-correlated live win probability;
 *  - a desk SUSPENSION on any leg freezes the whole cash-out (nothing moves);
 *  - a partial's RIDING remainder must clear the stake/payout limit gate — if it can't, the
 *    partial is refused atomically (nothing moves) while a FULL cash-out (which only reduces
 *    exposure) still settles.
 * Credit/balance only, integer cents.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { getBook } from '../book-store.js'
import { resetBookOdds, getBookOddsSnapshot } from './odds-source.js'
import { legFromSelection, type SlipLeg } from './slip.js'
import {
  placeBookBet,
  settleBookBet,
  cashOutBookBet,
  liveCashOutOffer,
  __resetPlacement,
} from './placement.js'
import { getBets, __resetBets } from './bets-store.js'
import { cashOutQuote, cashOutMath } from './cashout.js'
import { suspendMarket, __resetRiskControls } from '../risk-controls.js'
import { setLimit, __resetLimits } from '../../trading/limits.js'

const NOW = 1_750_000_000_000

const acct = (id: string) => getBook().members[id].account
const events = () => getBookOddsSnapshot().events
function leg(eventIdx: number, type: SlipLeg['marketType'], selIdx: number): SlipLeg {
  const e = events()[eventIdx]
  const m = e.markets.find((mk) => mk.type === type)!
  return legFromSelection(e, m, m.selections[selIdx])
}
function place(id: string, legs: SlipLeg[], mode: 'single' | 'parlay', stakeCents: number) {
  const m = getBook().members[id]
  return placeBookBet({ account: m.account, playerName: m.name, placedBy: m.name, legs, mode, stakeCents, now: NOW })
}
/** A same-game (SGP) ticket: moneyline + total on event 0. */
const sgpLegs = () => [leg(0, 'moneyline', 0), leg(0, 'total', 0)]

beforeEach(() => {
  __resetBets()
  __resetPlacement()
  __resetRiskControls()
  __resetLimits()
  resetBookOdds()
  for (const m of Object.values(getBook().members)) m.account.pending = 0
})

describe('full cash-out on an SGP ticket', () => {
  it('pays the live offer through core and closes the ticket', () => {
    const a = acct('p-priya')
    const [bet] = place('p-priya', sgpLegs(), 'parlay', 5_000)
    expect(bet.legs).toHaveLength(2)
    const rec = getBets().find((b) => b.id === bet.id)!
    const offer = liveCashOutOffer(rec, events())
    expect(offer).not.toBeNull()

    const before = a.balance
    const res = cashOutBookBet(bet.id, events(), { now: NOW })
    expect(res!.fullyClosed).toBe(true)
    expect(res!.cashedValueCents).toBe(offer)
    expect(a.balance).toBe(before + (offer! - 5_000))
    expect(a.pending).toBe(0)
    expect(getBets().find((b) => b.id === bet.id)!.status).toBe('cashed')
  })
})

describe('partial cash-out on an SGP ticket', () => {
  it('reduces stake proportionally and the remainder settles at the combined price', () => {
    const a = acct('p-priya')
    const [bet] = place('p-priya', sgpLegs(), 'parlay', 10_000)
    const decimal = bet.decimal
    const q = cashOutQuote(getBets().find((b) => b.id === bet.id)!, events())
    const m = cashOutMath(q.offerCents, 10_000, 0.5)

    const before = a.balance
    const res = cashOutBookBet(bet.id, events(), { fraction: 0.5, now: NOW })
    expect(res!.fullyClosed).toBe(false)
    expect(res!.keptStakeCents).toBe(5_000)
    expect(a.balance).toBe(before + (m.cashedValueCents - 5_000))
    expect(a.pending).toBe(5_000)
    expect(getBets().find((b) => b.id === bet.id)!.stakeCents).toBe(5_000)

    // the kept 5,000 rides on the SGP price and wins
    settleBookBet(bet.id, {}, NOW)
    expect(getBets().find((b) => b.id === bet.id)!.status).toBe('won')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(before + (m.cashedValueCents - 5_000) + Math.round(5_000 * (decimal - 1)))
  })
})

describe('suspension freezes cash-out (gate parity)', () => {
  it('a suspended leg makes the ticket un-cashable; it cashes once un-suspended', () => {
    const a = acct('p-lena')
    const [bet] = place('p-lena', sgpLegs(), 'parlay', 5_000)
    suspendMarket('total') // suspend one leg's market family
    const rec = getBets().find((b) => b.id === bet.id)!
    expect(liveCashOutOffer(rec, events())).toBeNull()
    expect(cashOutBookBet(bet.id, events(), { now: NOW })).toBeNull()
    // nothing moved
    expect(a.pending).toBe(5_000)
    expect(getBets().find((b) => b.id === bet.id)!.status).toBe('open')

    __resetRiskControls() // desk un-suspends
    const res = cashOutBookBet(bet.id, events(), { now: NOW })
    expect(res!.fullyClosed).toBe(true)
    expect(getBets().find((b) => b.id === bet.id)!.status).toBe('cashed')
  })
})

describe('liveCashOutOffer ↔ cashOutBookBet stay in parity across a line move', () => {
  it('a shown offer no-ops (nothing moves) once the leg leaves the live board', () => {
    const a = acct('p-lena')
    const [bet] = place('p-lena', [leg(0, 'moneyline', 0)], 'single', 10_000)
    const rec = getBets().find((b) => b.id === bet.id)!
    expect(liveCashOutOffer(rec, events())).not.toBeNull() // the UI would show this

    // the slate moves and the bet's market drops off the board; cashOutBookBet re-checks the
    // CURRENT slate (not a stale offer) → not cashable, and leaves the bet untouched
    expect(cashOutBookBet(bet.id, [], { now: NOW })).toBeNull()
    expect(a.pending).toBe(10_000)
    expect(getBets().find((b) => b.id === bet.id)!.status).toBe('open')
    expect(liveCashOutOffer(rec, [])).toBeNull() // and the UI stops offering it too
  })
})

describe('a partial remainder must clear the limit gate', () => {
  it('refuses a partial whose remainder exceeds a mid-life market limit; full still works', () => {
    const a = acct('p-priya')
    const [bet] = place('p-priya', [leg(0, 'moneyline', 0)], 'single', 10_000)
    // the desk tightens the market's stake limit AFTER the bet is on — below the would-be remainder
    setLimit({
      scope: 'market',
      scope_key: bet.legs[0].marketType,
      max_stake_cents: 1_000,
      max_payout_cents: 0,
      set_by: 'test',
    })

    const before = a.balance
    // a half cash-out would leave 5,000 riding > the 1,000 limit → refused, nothing moves
    expect(cashOutBookBet(bet.id, events(), { fraction: 0.5, now: NOW })).toBeNull()
    expect(a.balance).toBe(before)
    expect(a.pending).toBe(10_000)
    expect(getBets().find((b) => b.id === bet.id)!.status).toBe('open')

    // a FULL cash-out only REDUCES exposure, so the limit never blocks it
    const res = cashOutBookBet(bet.id, events(), { now: NOW })
    expect(res!.fullyClosed).toBe(true)
    expect(a.pending).toBe(0)
  })
})
