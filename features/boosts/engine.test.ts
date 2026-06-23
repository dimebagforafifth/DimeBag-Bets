/**
 * Boost settlement — proving value flows ONLY through the bonus engine's grant path:
 *   - a profit boost grants the capped uplift via core at settlement (figure up by profit +
 *     uplift; the single added money move is one core.grant — no second path);
 *   - the max-win cap, expiry clawback and eligibility all bind, reusing the engine;
 *   - an odds boost pays the improved line (true return + uplift = boosted return);
 *   - at most one boost per bet (no stacking); a loss / casino round / unknown bet grants nothing;
 *   - armBoostEngine wires real settlement to the grant.
 *
 * Money moves against the shared book (the real path); figures are snapshotted + restored.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getBook } from '../../app/book-store.js'
import { onGrant, placeWager, resolveWager, type ResolveEvent } from '../../core/index.js'
import { __resetBets, recordBet } from '../../app/book/bets-store.js'
import type { SlipLeg, SlipMode } from '../../app/book/slip.js'
import { __resetIssuance, resetRewardsConfig } from '../rewards/economy.js'
import { __resetBonusEngine, expireDue, getBonusGrants, grantsForPlayer } from '../bonus/index.js'
import { __resetBoosts, upsertBoost } from './store.js'
import { __disarmBoostEngine, armBoostEngine, settleBoostsForBet } from './engine.js'
import { boostedQuote, upliftCents } from './pricing.js'
import type { BoostDef } from './types.js'

const DAY = 86_400_000
const T = 1_750_000_000_000
const P = 'p-lena' // a seeded, active player

const bal = (id: string): number => getBook().members[id].account.balance
const pending = (id: string): number => getBook().members[id].account.pending

let snap: Record<string, { balance: number; pending: number }> = {}
let seq = 0

beforeEach(() => {
  __resetBonusEngine()
  __resetBoosts()
  __resetBets()
  resetRewardsConfig()
  __resetIssuance()
  const org = getBook()
  snap = {}
  for (const m of Object.values(org.members))
    snap[m.id] = { balance: m.account.balance, pending: m.account.pending }
})

afterEach(() => {
  __disarmBoostEngine()
  const org = getBook()
  for (const m of Object.values(org.members)) {
    const s = snap[m.id]
    if (s) {
      m.account.balance = s.balance
      m.account.pending = s.pending
    }
  }
  __resetBonusEngine()
  __resetBoosts()
  __resetBets()
})

function leg(over: Partial<SlipLeg> = {}): SlipLeg {
  return {
    key: `k${++seq}`,
    eventId: 'e1',
    eventLabel: 'A @ B',
    leagueId: 'l',
    marketId: 'e1:moneyline:game',
    marketType: 'moneyline',
    marketPeriod: 'game',
    side: 'home',
    pick: 'Home',
    price: { american: 100, decimal: 2.0 },
    sport: 'BASKETBALL',
    ...over,
  }
}

const boost = (over: Partial<BoostDef> = {}): BoostDef => ({
  id: 'b-test',
  name: 'Test Boost',
  enabled: true,
  boostType: 'profit',
  pct: 25,
  maxWinCents: null,
  playthroughX: 1,
  expiryMs: 7 * DAY,
  eligibility: {},
  qualifier: { minLegs: 1 },
  ...over,
})

/** Place a bet and WIN it through core (figure += profit), returning the settlement event. Does
 *  not itself fire boosts unless the engine is armed. */
function placeAndWin(
  stakeCents: number,
  decimal: number,
  legs: SlipLeg[],
  mode: SlipMode = 'single',
): ResolveEvent {
  const m = getBook().members[P]
  const id = `w-${++seq}`
  recordBet({
    id,
    accountId: P,
    playerName: m.name,
    placedBy: 't',
    mode,
    legs,
    stakeCents,
    decimal,
    status: 'open',
    placedAt: T,
  })
  const w = placeWager(m.account, stakeCents, id)
  const before = m.account.balance
  resolveWager(m.account, w, 'win', decimal)
  return {
    accountId: P,
    wagerId: id,
    stake: stakeCents,
    outcome: 'win',
    payoutMultiplier: decimal,
    profit: m.account.balance - before,
  }
}

describe('profit boost — granted through core at settlement', () => {
  it('grants pct% of winnings via a single core.grant (figure up by profit + uplift)', () => {
    upsertBoost(boost({ pct: 25 }))
    const grants: number[] = []
    const off = onGrant((e) => grants.push(e.cents))
    const start = bal(P)

    const ev = placeAndWin(10_000, 2.0, [leg()]) // profit = 10,000
    const created = settleBoostsForBet(ev, T)
    off()

    const uplift = upliftCents(ev.profit, 25) // 2,500
    expect(ev.profit).toBe(10_000)
    expect(created).toHaveLength(1)
    expect(created[0].grantedCents).toBe(uplift)
    expect(bal(P) - start).toBe(ev.profit + uplift) // win + boost
    expect(grants).toEqual([uplift]) // the ONLY added money move is one core.grant
    expect(pending(P)).toBe(snap[P].pending) // a grant is not a wager
  })

  it('respects the max-win cap', () => {
    upsertBoost(boost({ pct: 25, maxWinCents: 1_000 }))
    const start = bal(P)
    const ev = placeAndWin(10_000, 2.0, [leg()])
    const created = settleBoostsForBet(ev, T)
    expect(created[0].grantedCents).toBe(1_000) // capped from 2,500
    expect(bal(P) - start).toBe(ev.profit + 1_000)
  })

  it('claws the uncleared uplift back at expiry (through core)', () => {
    upsertBoost(boost({ pct: 25, playthroughX: 5, expiryMs: DAY }))
    const start = bal(P)
    const ev = placeAndWin(10_000, 2.0, [leg()])
    settleBoostsForBet(ev, T)
    const uplift = upliftCents(ev.profit, 25)
    expect(bal(P) - start).toBe(ev.profit + uplift)

    const expired = expireDue(T + DAY + 1)
    expect(expired.some((g) => g.ruleId === 'b-test')).toBe(true)
    expect(bal(P) - start).toBe(ev.profit) // boost clawed back; the win stands
  })

  it('an ineligible player gets no boost', () => {
    upsertBoost(boost({ pct: 25, eligibility: { minBalanceCents: 1_000_000_000 } })) // unreachable figure
    const start = bal(P)
    const ev = placeAndWin(10_000, 2.0, [leg()])
    const created = settleBoostsForBet(ev, T)
    expect(created).toHaveLength(0)
    expect(grantsForPlayer(P).some((g) => g.ruleId === 'b-test')).toBe(false)
    expect(bal(P) - start).toBe(ev.profit) // only the win
  })
})

describe('eligibility is taken at placement, not after the win', () => {
  it('a "down/at-risk" player who wins big still gets the boost they placed', () => {
    // p-marco is seeded negative (at-risk). A maxBalanceCents:-1 boost targets players in the red.
    armBoostEngine()
    // Small pct so the uplift on a large (figure-flipping) win stays under the issuance cap; the
    // point of this test is the eligibility GATE, not the amount.
    upsertBoost(boost({ id: 'b-atrisk', pct: 2, eligibility: { maxBalanceCents: -1 } }))
    const m = getBook().members['p-marco']
    expect(m.account.balance).toBeLessThan(0)
    const id = `w-${++seq}`
    recordBet({
      id,
      accountId: 'p-marco',
      playerName: m.name,
      placedBy: 't',
      mode: 'single',
      legs: [leg()],
      stakeCents: 50_000,
      decimal: 2.0,
      status: 'open',
      placedAt: T,
    })
    const w = placeWager(m.account, 50_000, id) // onWagerPlaced snapshots pre-win (negative) balance
    resolveWager(m.account, w, 'win', 2.0) // win flips the figure positive
    expect(m.account.balance).toBeGreaterThan(0) // no longer "at-risk" by live state...
    // ...yet the boost (eligible at placement) was still granted.
    expect(getBonusGrants().some((g) => g.ruleId === 'b-atrisk' && g.playerId === 'p-marco')).toBe(
      true,
    )
  })
})

describe('odds boost — pays the improved line', () => {
  it('grants return × pct% so total = boosted-line return', () => {
    upsertBoost(boost({ id: 'b-odds', boostType: 'odds', pct: 20 }))
    const start = bal(P)
    const stake = 10_000
    const decimal = 2.0
    const ev = placeAndWin(stake, decimal, [leg({ price: { american: 100, decimal } })])
    settleBoostsForBet(ev, T)

    const q = boostedQuote(stake, decimal, 20)
    // win (profit) + boost (uplift) == boosted return − stake == improved-line profit
    expect(bal(P) - start).toBe(q.boostedReturnCents - stake)
    expect(bal(P) - start).toBe(ev.profit + q.upliftCents)
  })
})

describe('one boost per bet + non-qualifying settlements', () => {
  it('issues only the single best boost (no stacking)', () => {
    upsertBoost(boost({ id: 'b-profit', boostType: 'profit', pct: 25 })) // uplift 2,500
    upsertBoost(boost({ id: 'b-odds', boostType: 'odds', pct: 20 })) // uplift 4,000 (on 20,000 return)
    const ev = placeAndWin(10_000, 2.0, [leg()])
    const created = settleBoostsForBet(ev, T)
    expect(created).toHaveLength(1)
    expect(created[0].ruleId).toBe('b-odds') // the larger uplift wins
  })

  it('ranks by the CAPPED uplift — a high-pct boost with a low cap loses to a steadier one', () => {
    // profit boost: 100% of 10,000 winnings = 10,000, but capped at 1,000.
    upsertBoost(boost({ id: 'b-capped', boostType: 'profit', pct: 100, maxWinCents: 1_000 }))
    // profit boost: 25% of 10,000 = 2,500, uncapped.
    upsertBoost(boost({ id: 'b-steady', boostType: 'profit', pct: 25, maxWinCents: null }))
    const ev = placeAndWin(10_000, 2.0, [leg()])
    const created = settleBoostsForBet(ev, T)
    expect(created[0].ruleId).toBe('b-steady') // pays 2,500 > the capped 1,000
    expect(created[0].grantedCents).toBe(2_500)
  })

  it('never boosts the same bet twice (idempotent)', () => {
    upsertBoost(boost({ pct: 25 }))
    const ev = placeAndWin(10_000, 2.0, [leg()])
    expect(settleBoostsForBet(ev, T)).toHaveLength(1)
    expect(settleBoostsForBet(ev, T)).toHaveLength(0) // a re-fire grants nothing
  })

  it('a loss, a push, and an unknown/casino wager grant nothing', () => {
    upsertBoost(boost())
    const loss: ResolveEvent = {
      accountId: P,
      wagerId: 'x',
      stake: 10_000,
      outcome: 'loss',
      payoutMultiplier: 0,
      profit: -10_000,
    }
    const noBet: ResolveEvent = {
      accountId: P,
      wagerId: 'not-a-bet',
      stake: 10_000,
      outcome: 'win',
      payoutMultiplier: 2,
      profit: 10_000,
    }
    expect(settleBoostsForBet(loss, T)).toEqual([])
    expect(settleBoostsForBet(noBet, T)).toEqual([]) // no recorded BookBet → not a sportsbook slip
  })
})

describe('armBoostEngine — wires real settlement to the grant', () => {
  it('grants the boost when a qualifying bet resolves through core', () => {
    armBoostEngine()
    upsertBoost(boost({ pct: 25 }))
    const m = getBook().members[P]
    const id = `w-${++seq}`
    recordBet({
      id,
      accountId: P,
      playerName: m.name,
      placedBy: 't',
      mode: 'single',
      legs: [leg()],
      stakeCents: 10_000,
      decimal: 2.0,
      status: 'open',
      placedAt: T,
    })
    const w = placeWager(m.account, 10_000, id)
    resolveWager(m.account, w, 'win', 2.0) // armed listener fires the boost
    expect(getBonusGrants().some((g) => g.ruleId === 'b-test' && g.playerId === P)).toBe(true)
  })
})
