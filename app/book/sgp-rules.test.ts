/**
 * SGP conflict validation (PART 1): the hard-block matrix runs BEFORE pricing, blocks every
 * mutually-exclusive / nested combination with the offending pair, dedupes, and enforces the
 * tenant leg cap. Survivors flow to the existing correlation pricing — same-direction shorter,
 * opposing-direction longer — never a naive same-game multiply. And a blocked slip never reaches
 * `placeWager`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SlipLeg } from './slip.js'
import { effectiveSgpCorrelation, parlayPrice, sgpPrice } from './slip.js'
import {
  __resetSgpRules,
  setMaxLegs,
  setStrictness,
  validateSlip,
  currentStrictnessConfig,
} from './sgp-rules.js'
import { placeBookBet } from './placement.js'
import { __resetBets } from './bets-store.js'
import type { Account } from '../../core/index.js'

/** Build a leg by hand (avoids needing every market shape on the mock slate). */
function leg(over: Partial<SlipLeg> & { key: string }): SlipLeg {
  return {
    key: over.key,
    eventId: over.eventId ?? 'ev1',
    eventLabel: 'Away @ Home',
    leagueId: 'L',
    marketId: over.marketId ?? `${over.marketType}-${over.key}`,
    marketType: over.marketType ?? 'total',
    marketPeriod: over.marketPeriod ?? 'game',
    side: over.side ?? 'over',
    pick: over.pick ?? over.key,
    price: over.price ?? { american: -110, decimal: 1.909 },
    sport: over.sport ?? 'BASKETBALL',
    trueProb: over.trueProb ?? 0.5,
    ...(over.line === undefined ? {} : { line: over.line }),
    ...(over.statId ? { statId: over.statId } : {}),
    ...(over.playerId ? { playerId: over.playerId } : {}),
  }
}

beforeEach(() => {
  __resetSgpRules()
  __resetBets()
})
afterEach(() => __resetSgpRules())

describe('validateSlip — hard blocks', () => {
  it('BLOCKS over + under of the same total', () => {
    const over = leg({ key: 'o', marketType: 'total', side: 'over', line: 220.5, marketId: 'tot' })
    const under = leg({
      key: 'u',
      marketType: 'total',
      side: 'under',
      line: 220.5,
      marketId: 'tot',
    })
    const v = validateSlip([over, under])
    expect(v.ok).toBe(false)
    expect(v.blocks[0].reason).toBe('opposing_total')
    expect(v.blocks[0].keys.sort()).toEqual(['o', 'u'])
  })

  it('BLOCKS both teams’ moneyline (A-ML + B-ML)', () => {
    const home = leg({ key: 'h', marketType: 'moneyline', side: 'home', marketId: 'ml' })
    const away = leg({ key: 'a', marketType: 'moneyline', side: 'away', marketId: 'ml' })
    const v = validateSlip([home, away])
    expect(v.ok).toBe(false)
    expect(v.blocks[0].reason).toBe('opposing_moneyline')
  })

  it('BLOCKS over + under of the same player prop', () => {
    const o = leg({
      key: 'po',
      marketType: 'prop',
      side: 'over',
      line: 27.5,
      playerId: 'lebron',
      statId: 'points',
    })
    const u = leg({
      key: 'pu',
      marketType: 'prop',
      side: 'under',
      line: 27.5,
      playerId: 'lebron',
      statId: 'points',
    })
    const v = validateSlip([o, u])
    expect(v.ok).toBe(false)
    expect(v.blocks[0].reason).toBe('opposing_prop')
  })

  it('BLOCKS nested prop lines (Over 20.5 + Over 25.5 — one implies the other)', () => {
    const a = leg({
      key: 'n1',
      marketType: 'prop',
      side: 'over',
      line: 20.5,
      playerId: 'lebron',
      statId: 'points',
    })
    const b = leg({
      key: 'n2',
      marketType: 'prop',
      side: 'over',
      line: 25.5,
      playerId: 'lebron',
      statId: 'points',
    })
    const v = validateSlip([a, b])
    expect(v.ok).toBe(false)
    expect(v.blocks[0].reason).toBe('nested_prop')
  })

  it('BLOCKS both sides of the same spread', () => {
    const home = leg({ key: 'sh', marketType: 'spread', side: 'home', line: -3.5, marketId: 'sp' })
    const away = leg({ key: 'sa', marketType: 'spread', side: 'away', line: 3.5, marketId: 'sp' })
    expect(validateSlip([home, away]).blocks[0]?.reason).toBe('opposing_spread')
  })

  it('BLOCKS nested same-side TOTALS (Over 220.5 + Over 224.5 — one implies the other)', () => {
    const lo = leg({ key: 't1', marketType: 'total', side: 'over', line: 220.5, marketId: 'tot' })
    const hi = leg({
      key: 't2',
      marketType: 'total',
      side: 'over',
      line: 224.5,
      marketId: 'tot-alt',
    })
    expect(validateSlip([lo, hi]).blocks[0]?.reason).toBe('nested_total')
  })

  it('BLOCKS nested same-side SPREADS (Home -3.5 + Home -7.5 — one implies the other)', () => {
    const a = leg({ key: 's1', marketType: 'spread', side: 'home', line: -3.5, marketId: 'sp' })
    const b2 = leg({
      key: 's2',
      marketType: 'spread',
      side: 'home',
      line: -7.5,
      marketId: 'sp-alt',
    })
    expect(validateSlip([a, b2]).blocks[0]?.reason).toBe('nested_spread')
  })
})

describe('validateSlip — allowed (flows to correlation pricing), dedupe, cap', () => {
  it('does NOT block a 1st-half total with a full-game total (different period)', () => {
    const firstHalfUnder = leg({
      key: 'h1u',
      marketType: 'total',
      side: 'under',
      marketPeriod: '1H',
      marketId: 't1h',
    })
    const gameUnder = leg({
      key: 'gu',
      marketType: 'total',
      side: 'under',
      marketPeriod: 'game',
      marketId: 'tgame',
    })
    const v = validateSlip([firstHalfUnder, gameUnder])
    expect(v.ok).toBe(true)
  })

  it('1H-under + game-under prices SHORTER than independent (positive correlation)', () => {
    const firstHalfUnder = leg({
      key: 'h1u',
      marketType: 'total',
      side: 'under',
      marketPeriod: '1H',
      marketId: 't1h',
      trueProb: 0.5,
    })
    const gameUnder = leg({
      key: 'gu',
      marketType: 'total',
      side: 'under',
      marketPeriod: 'game',
      marketId: 'tgame',
      trueProb: 0.5,
    })
    const legs = [firstHalfUnder, gameUnder]
    expect(sgpPrice(legs)).toBeLessThan(parlayPrice(legs))
  })

  it('1H-under + game-over prices LONGER than independent (negative correlation)', () => {
    const firstHalfUnder = leg({
      key: 'h1u',
      marketType: 'total',
      side: 'under',
      marketPeriod: '1H',
      marketId: 't1h',
      trueProb: 0.5,
    })
    const gameOver = leg({
      key: 'go',
      marketType: 'total',
      side: 'over',
      marketPeriod: 'game',
      marketId: 'tgame',
      trueProb: 0.5,
    })
    const legs = [firstHalfUnder, gameOver]
    expect(validateSlip(legs).ok).toBe(true)
    expect(sgpPrice(legs)).toBeGreaterThan(parlayPrice(legs))
  })

  it('does NOT price a cross-axis pair (away ML + over total) LONGER than independent', () => {
    // away (team axis) and over (scoring axis) share no axis → no spurious negative correlation;
    // the parlay prices at-or-under independent (house-safe), never longer (player overpay).
    const awayMl = leg({
      key: 'aml',
      marketType: 'moneyline',
      side: 'away',
      marketId: 'ml',
      trueProb: 0.45,
    })
    const over = leg({
      key: 'ov',
      marketType: 'total',
      side: 'over',
      line: 220.5,
      marketId: 'tot',
      trueProb: 0.5,
    })
    const legs = [awayMl, over]
    expect(validateSlip(legs).ok).toBe(true)
    // ≤ independent (house-safe), within 4dp pricing granularity — NOT meaningfully longer.
    expect(sgpPrice(legs)).toBeLessThanOrEqual(parlayPrice(legs) + 1e-3)
  })

  it('the SGP correlation is invariant to the home/away label of a favourite + over', () => {
    const over = leg({ key: 'ov', marketType: 'total', side: 'over', line: 220.5, trueProb: 0.5 })
    const homeMl = leg({ key: 'hml', marketType: 'moneyline', side: 'home', trueProb: 0.7 })
    const awayMl = leg({ key: 'aml', marketType: 'moneyline', side: 'away', trueProb: 0.7 })
    // The favourite-plus-over correlation can't depend on which side is labelled home — both
    // resolve to the same (non-negative) sign, so neither is mispriced longer than the other.
    expect(effectiveSgpCorrelation([homeMl, over])).toBe(effectiveSgpCorrelation([awayMl, over]))
    expect(effectiveSgpCorrelation([awayMl, over])).toBeGreaterThanOrEqual(0)
  })

  it('dedupes an exact duplicate leg', () => {
    const a = leg({ key: 'dup', marketType: 'moneyline', side: 'home' })
    const v = validateSlip([a, { ...a }])
    expect(v.legs).toHaveLength(1)
    expect(v.removedDuplicateKeys).toEqual(['dup'])
    expect(v.ok).toBe(true)
  })

  it('rejects the 11th leg on a 10-cap tenant', () => {
    expect(currentStrictnessConfig().max_legs).toBe(10)
    const legs = Array.from({ length: 11 }, (_, i) =>
      leg({ key: `L${i}`, eventId: `ev${i}`, marketType: 'moneyline', side: 'home' }),
    )
    const v = validateSlip(legs)
    expect(v.ok).toBe(false)
    expect(v.blocks.some((b) => b.reason === 'max_legs')).toBe(true)
    // 10 legs is fine
    expect(validateSlip(legs.slice(0, 10)).ok).toBe(true)
  })

  it('strict strictness lowers the cap; block-contradictions can never be disabled', () => {
    setStrictness('strict')
    expect(currentStrictnessConfig().max_legs).toBe(6)
    expect(currentStrictnessConfig().block_contradictions).toBe(true)
    setMaxLegs(99) // can't exceed the hard ceiling
    expect(currentStrictnessConfig().max_legs).toBeLessThanOrEqual(10)
  })
})

describe('placement — a blocked slip never reaches placeWager', () => {
  const account = (): Account => ({ id: 'p1', creditLimit: 1_000_000, balance: 0, pending: 0 })

  it('throws and moves no money for a contradictory parlay', () => {
    const acct = account()
    const over = leg({ key: 'o', marketType: 'total', side: 'over', line: 220.5, marketId: 'tot' })
    const under = leg({
      key: 'u',
      marketType: 'total',
      side: 'under',
      line: 220.5,
      marketId: 'tot',
    })
    expect(() =>
      placeBookBet({
        account: acct,
        playerName: 'P',
        placedBy: 'P',
        legs: [over, under],
        mode: 'parlay',
        stakeCents: 5_000,
        now: 1,
      }),
    ).toThrow()
    // the stake never reached core — pending and balance untouched
    expect(acct.pending).toBe(0)
    expect(acct.balance).toBe(0)
  })

  it('places a legal same-game parlay (deduped) and holds the stake once', () => {
    const acct = account()
    const a = leg({
      key: 'a',
      marketType: 'total',
      side: 'under',
      marketPeriod: '1H',
      marketId: 't1h',
    })
    const b = leg({
      key: 'b',
      marketType: 'total',
      side: 'under',
      marketPeriod: 'game',
      marketId: 'tg',
    })
    const bets = placeBookBet({
      account: acct,
      playerName: 'P',
      placedBy: 'P',
      legs: [a, b, { ...a }], // a duplicate that should be deduped away
      mode: 'parlay',
      stakeCents: 5_000,
      now: 1,
    })
    expect(bets).toHaveLength(1)
    expect(bets[0].legs).toHaveLength(2) // dupe removed
    expect(acct.pending).toBe(5_000)
  })
})
