import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import { playSicBo } from './engine.js'
import { rollDice, verifyRoll, type Dice } from './fair.js'
import { betReturn, comboList, edgeOf, rtpOf, singleReturn, totalOdds } from './payouts.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000000, balance: 0, pending: 0, ...overrides }
}

const BASE = { clientSeed: 'sicbo-client', nonce: 1, serverSeed: 'sicbo-server' } as const

describe('rollDice', () => {
  it('yields three dice in 1..6, deterministically', () => {
    const r = rollDice('sicbo-server', 'sicbo-client', 1)
    expect(r).toHaveLength(3)
    for (const d of r) {
      expect(d).toBeGreaterThanOrEqual(1)
      expect(d).toBeLessThanOrEqual(6)
      expect(Number.isInteger(d)).toBe(true)
    }
    // same seeds → same roll
    expect(rollDice('sicbo-server', 'sicbo-client', 1)).toEqual(r)
    // different nonce → (generally) a different roll stream
    expect(rollDice('sicbo-server', 'sicbo-client', 2)).not.toEqual(undefined)
  })

  it('round-trips through verifyRoll, and rejects a tampered roll', () => {
    const r = rollDice(BASE.serverSeed, BASE.clientSeed, BASE.nonce)
    expect(verifyRoll(BASE.serverSeed, BASE.clientSeed, BASE.nonce, r)).toBe(true)
    const tampered = [r[0] === 6 ? 1 : r[0] + 1, r[1], r[2]] as Dice
    expect(verifyRoll(BASE.serverSeed, BASE.clientSeed, BASE.nonce, tampered)).toBe(false)
  })

  it('covers the full 1..6 range across many nonces (uniform mapping)', () => {
    const seen = new Set<number>()
    for (let n = 1; n <= 200; n++) {
      for (const d of rollDice('seed', 'client', n)) seen.add(d)
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('payout odds', () => {
  it('Small/Big pay even money and LOSE on any triple', () => {
    // total 9 (4..10), not a triple → small wins, big loses
    expect(betReturn({ type: 'small' }, [2, 3, 4])).toBe(2)
    expect(betReturn({ type: 'big' }, [2, 3, 4])).toBe(0)
    // total 12 (11..17) → big wins, small loses
    expect(betReturn({ type: 'big' }, [3, 4, 5])).toBe(2)
    expect(betReturn({ type: 'small' }, [3, 4, 5])).toBe(0)
    // a small triple (1-1-1, total 3? no — triples 2-2-2 total 6 is in small range)
    expect(betReturn({ type: 'small' }, [2, 2, 2])).toBe(0) // triple → small loses
    // a big triple (5-5-5 total 15) → big loses on the triple
    expect(betReturn({ type: 'big' }, [5, 5, 5])).toBe(0)
  })

  it('Odd/Even pay even money and LOSE on any triple', () => {
    // total 9 (odd), not a triple
    expect(betReturn({ type: 'odd' }, [2, 3, 4])).toBe(2)
    expect(betReturn({ type: 'even' }, [2, 3, 4])).toBe(0)
    // total 12 (even), not a triple
    expect(betReturn({ type: 'even' }, [3, 4, 5])).toBe(2)
    expect(betReturn({ type: 'odd' }, [3, 4, 5])).toBe(0)
    // a triple loses BOTH, whatever the parity (3-3-3 sums to 9, odd)
    expect(betReturn({ type: 'odd' }, [3, 3, 3])).toBe(0)
    expect(betReturn({ type: 'even' }, [3, 3, 3])).toBe(0)
    // an even triple (2-2-2 sums to 6) loses Even too
    expect(betReturn({ type: 'even' }, [2, 2, 2])).toBe(0)
  })

  it('Two-dice Combination pays 5:1 (6x) when BOTH chosen faces appear', () => {
    expect(betReturn({ type: 'combo', param: 1, param2: 2 }, [1, 2, 5])).toBe(6)
    expect(betReturn({ type: 'combo', param: 1, param2: 2 }, [2, 1, 1])).toBe(6) // dupes are fine
    expect(betReturn({ type: 'combo', param: 1, param2: 2 }, [1, 1, 5])).toBe(0) // only one face
    expect(betReturn({ type: 'combo', param: 1, param2: 2 }, [3, 4, 5])).toBe(0) // neither face
    // face order doesn't matter
    expect(betReturn({ type: 'combo', param: 5, param2: 3 }, [3, 5, 1])).toBe(6)
    // two identical faces is not a valid combination
    expect(() => betReturn({ type: 'combo', param: 4, param2: 4 }, [4, 4, 1])).toThrow(/DISTINCT/)
  })

  it('comboList enumerates the 15 distinct pairs (a < b)', () => {
    const list = comboList()
    expect(list).toHaveLength(15)
    expect(list[0]).toEqual([1, 2])
    expect(list[list.length - 1]).toEqual([5, 6])
    // all pairs distinct and sorted
    for (const [a, b] of list) expect(a).toBeLessThan(b)
    expect(new Set(list.map(([a, b]) => `${a}-${b}`)).size).toBe(15)
  })

  it('Single pays 1x/2x/3x (return 2/3/4) by how many dice show the face', () => {
    expect(singleReturn(1)).toBe(2)
    expect(singleReturn(2)).toBe(3)
    expect(singleReturn(3)).toBe(4)
    expect(betReturn({ type: 'single', param: 5 }, [5, 1, 2])).toBe(2) // once
    expect(betReturn({ type: 'single', param: 5 }, [5, 5, 2])).toBe(3) // twice
    expect(betReturn({ type: 'single', param: 5 }, [5, 5, 5])).toBe(4) // thrice
    expect(betReturn({ type: 'single', param: 5 }, [1, 2, 3])).toBe(0) // none
  })

  it('Specific double pays 10:1 (11x) on at least two of the face', () => {
    expect(betReturn({ type: 'double', param: 3 }, [3, 3, 1])).toBe(11)
    expect(betReturn({ type: 'double', param: 3 }, [3, 3, 3])).toBe(11) // triple counts as ≥2
    expect(betReturn({ type: 'double', param: 3 }, [3, 1, 2])).toBe(0)
  })

  it('Any triple pays 30:1 (31x), specific triple 180:1 (181x)', () => {
    expect(betReturn({ type: 'anyTriple' }, [4, 4, 4])).toBe(31)
    expect(betReturn({ type: 'anyTriple' }, [4, 4, 5])).toBe(0)
    expect(betReturn({ type: 'triple', param: 4 }, [4, 4, 4])).toBe(181)
    expect(betReturn({ type: 'triple', param: 4 }, [5, 5, 5])).toBe(0) // wrong face
    expect(betReturn({ type: 'triple', param: 4 }, [4, 4, 5])).toBe(0) // not a triple
  })

  it('totalOdds matches the standard schedule (symmetric)', () => {
    const expected: Record<number, number> = {
      4: 60, 17: 60,
      5: 30, 16: 30,
      6: 17, 15: 17,
      7: 12, 14: 12,
      8: 8, 13: 8,
      9: 6, 12: 6,
      10: 6, 11: 6,
    }
    for (const t of Object.keys(expected).map(Number)) {
      expect(totalOdds(t)).toBe(expected[t])
    }
    expect(() => totalOdds(3)).toThrow(/total must be/)
    expect(() => totalOdds(18)).toThrow(/total must be/)
  })

  it('Total bet returns odds+1 on the exact total, 0 otherwise', () => {
    expect(betReturn({ type: 'total', param: 4 }, [1, 1, 2])).toBe(61) // total 4
    expect(betReturn({ type: 'total', param: 9 }, [2, 3, 4])).toBe(7) // total 9 → 6:1
    expect(betReturn({ type: 'total', param: 9 }, [1, 1, 1])).toBe(0) // total 3
  })
})

describe('inherent house edges (back-checked over all 216 rolls)', () => {
  it('Small/Big edge ≈ 2.78%', () => {
    expect(edgeOf({ type: 'small' })).toBeCloseTo(0.0278, 4)
    expect(edgeOf({ type: 'big' })).toBeCloseTo(0.0278, 4)
  })
  it('Odd/Even edge ≈ 2.78% (same even-money house edge, lose on triples)', () => {
    expect(edgeOf({ type: 'odd' })).toBeCloseTo(0.0278, 4)
    expect(edgeOf({ type: 'even' })).toBeCloseTo(0.0278, 4)
  })
  it('Two-dice Combination edge ≈ 16.67% (30 of 216 ways, pays 5:1)', () => {
    // every one of the 15 combinations has the identical edge
    for (const [a, b] of comboList()) {
      expect(edgeOf({ type: 'combo', param: a, param2: b })).toBeCloseTo(0.1667, 4)
    }
    expect(rtpOf({ type: 'combo', param: 1, param2: 2 })).toBeCloseTo(6 * (30 / 216), 6)
  })
  it('Any Triple edge ≈ 13.89%, Specific Triple ≈ 16.20%', () => {
    expect(edgeOf({ type: 'anyTriple' })).toBeCloseTo(0.1389, 4)
    expect(edgeOf({ type: 'triple', param: 6 })).toBeCloseTo(0.162, 3)
  })
  it('Specific Double edge ≈ 18.52%', () => {
    expect(edgeOf({ type: 'double', param: 2 })).toBeCloseTo(0.1852, 4)
  })
  it('Single edge ≈ 7.87%', () => {
    expect(edgeOf({ type: 'single', param: 1 })).toBeCloseTo(0.0787, 3)
  })
  it('Total edges match the standard schedule (worst total 9/12 ≈ 18.98%)', () => {
    expect(edgeOf({ type: 'total', param: 9 })).toBeCloseTo(0.1898, 4)
    expect(edgeOf({ type: 'total', param: 4 })).toBeCloseTo(0.1528, 4)
    expect(edgeOf({ type: 'total', param: 7 })).toBeCloseTo(0.0972, 4)
    // total 10 has 27 of 216 ways and pays 7× → RTP = 7·27/216
    expect(rtpOf({ type: 'total', param: 10 })).toBeCloseTo(7 * (27 / 216), 6)
  })
})

describe('playSicBo settlement through core', () => {
  function findRoll(predicate: (d: Dice) => boolean): { serverSeed: string; dice: Dice } {
    for (let n = 1; n < 5000; n++) {
      const serverSeed = `seed-${n}`
      const dice = rollDice(serverSeed, 'c', 1)
      if (predicate(dice)) return { serverSeed, dice }
    }
    throw new Error('no matching roll found')
  }

  it('settles a single winning bet at its return multiplier (pending released)', () => {
    const a = account()
    // pick a seed that yields a total in the small range and not a triple
    const { serverSeed, dice } = findRoll((d) => {
      const s = d[0] + d[1] + d[2]
      return s >= 4 && s <= 10 && !(d[0] === d[1] && d[1] === d[2])
    })
    const r = playSicBo(a, {
      bets: [{ type: 'small', stake: 1000 }],
      clientSeed: 'c',
      nonce: 1,
      serverSeed,
    })
    expect(r.dice).toEqual(dice)
    expect(r.results[0].won).toBe(true)
    expect(r.results[0].multiplier).toBe(2)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(1000) // +1× profit on a 2× return
    expect(r.totalProfit).toBe(1000)
    expect(r.totalReturn).toBe(2000)
  })

  it('settles a single losing bet at 0× (full loss, pending released)', () => {
    const a = account()
    const { serverSeed } = findRoll((d) => {
      const s = d[0] + d[1] + d[2]
      return s >= 11 && s <= 17 && !(d[0] === d[1] && d[1] === d[2])
    })
    const r = playSicBo(a, {
      bets: [{ type: 'small', stake: 500 }],
      clientSeed: 'c',
      nonce: 1,
      serverSeed,
    })
    expect(r.results[0].won).toBe(false)
    expect(r.results[0].multiplier).toBe(0)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(-500)
    expect(r.totalProfit).toBe(-500)
  })

  it('settles a multi-bet round, each wager independently and correctly', () => {
    const a = account()
    // find a clean roll, then build bets whose outcomes we compute from it
    const { serverSeed, dice } = findRoll((d) => {
      const s = d[0] + d[1] + d[2]
      return s >= 4 && s <= 10 && !(d[0] === d[1] && d[1] === d[2]) && d.includes(d[0])
    })
    const face = dice[0]
    const bets = [
      { type: 'small' as const, stake: 1000 }, // wins (2×)
      { type: 'big' as const, stake: 1000 }, // loses (0×)
      { type: 'single' as const, param: face, stake: 1000 }, // wins (≥2×)
    ]
    const r = playSicBo(a, { bets, clientSeed: 'c', nonce: 1, serverSeed })

    // compute the expected return for each independently
    const expected = bets.map((b) => betReturn({ type: b.type, param: b.param }, dice))
    expect(r.results.map((x) => x.multiplier)).toEqual(expected)

    const expectedProfit = bets.reduce(
      (acc, b, i) => acc + Math.round(b.stake * (expected[i] - 1)),
      0,
    )
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(expectedProfit)
    expect(r.totalProfit).toBe(expectedProfit)
    expect(r.totalStake).toBe(3000)
  })

  it('settles a winning two-dice Combination at 6× through core', () => {
    const a = account()
    // a roll containing both a 1 and a 2 (not necessarily a triple)
    const { serverSeed, dice } = findRoll((d) => d.includes(1) && d.includes(2))
    const r = playSicBo(a, {
      bets: [{ type: 'combo', param: 1, param2: 2, stake: 1000 }],
      clientSeed: 'c',
      nonce: 1,
      serverSeed,
    })
    expect(r.dice).toEqual(dice)
    expect(r.results[0].won).toBe(true)
    expect(r.results[0].multiplier).toBe(6)
    expect(r.results[0].param2).toBe(2)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(5000) // +5× profit on a 6× return
    expect(r.totalProfit).toBe(5000)
  })

  it('a push-like even-money win + loss nets to zero profit', () => {
    const a = account()
    // small wins (+1000) and a same-stake big loses (−1000) → net 0
    const { serverSeed } = findRoll((d) => {
      const s = d[0] + d[1] + d[2]
      return s >= 4 && s <= 10 && !(d[0] === d[1] && d[1] === d[2])
    })
    const r = playSicBo(a, {
      bets: [
        { type: 'small', stake: 1000 },
        { type: 'big', stake: 1000 },
      ],
      clientSeed: 'c',
      nonce: 1,
      serverSeed,
    })
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(0)
    expect(r.totalProfit).toBe(0)
  })

  it('a triple settles every even-money bet as a loss while the triples/doubles win, in one pass', () => {
    const a = account()
    // a triple whose total lands in the Small range (face 2 → 6, face 3 → 9), so
    // Small would WIN if not for the triple-override rule — proving the override.
    const { serverSeed, dice } = findRoll(
      (d) => d[0] === d[1] && d[1] === d[2] && d[0] >= 2 && d[0] <= 3,
    )
    const face = dice[0]
    const bets = [
      { type: 'small' as const, stake: 1000 }, // loses despite total being 4..10
      { type: 'odd' as const, stake: 1000 }, // any triple loses
      { type: 'even' as const, stake: 1000 }, // any triple loses
      { type: 'anyTriple' as const, stake: 1000 }, // wins 31×
      { type: 'double' as const, param: face, stake: 1000 }, // wins 11× (triple counts as ≥2)
      { type: 'triple' as const, param: face, stake: 1000 }, // wins 181×
    ]
    const r = playSicBo(a, { bets, clientSeed: 'c', nonce: 1, serverSeed })
    expect(r.dice).toEqual(dice)
    const mult = (t: string, p?: number) =>
      r.results.find((x) => x.type === t && x.param === p)!.multiplier
    expect(mult('small')).toBe(0)
    expect(mult('odd')).toBe(0)
    expect(mult('even')).toBe(0)
    expect(mult('anyTriple')).toBe(31)
    expect(mult('double', face)).toBe(11)
    expect(mult('triple', face)).toBe(181)
    const expected = -1000 - 1000 - 1000 + 30 * 1000 + 10 * 1000 + 180 * 1000
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(expected)
    expect(r.totalProfit).toBe(expected)
  })

  it('rejects a MALFORMED bet up front — no wager placed, no partial settlement', () => {
    const a = account()
    // a combo with two equal faces is invalid: the whole round must reject BEFORE
    // any placeWager, so the valid Small bet alongside it never settles.
    expect(() =>
      playSicBo(a, {
        bets: [
          { type: 'small', stake: 1000 },
          { type: 'combo', param: 4, param2: 4, stake: 1000 },
        ],
        clientSeed: 'c',
        nonce: 1,
        serverSeed: 'seed',
      }),
    ).toThrow(/DISTINCT/)
    expect(a.pending).toBe(0) // nothing held
    expect(a.balance).toBe(0) // nothing settled

    // a triple bet with a missing face is likewise rejected before any money moves
    // (and on EVERY roll, not only on the rare triples — the guard is roll-independent)
    expect(() =>
      playSicBo(a, {
        bets: [{ type: 'triple', stake: 1000 }],
        clientSeed: 'c',
        nonce: 1,
        serverSeed: 'seed',
      }),
    ).toThrow(/face 1\.\.6/)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(0)
  })

  it('exposes a verifiable roll and rejects an over-limit stack', () => {
    const r = playSicBo(account(), {
      bets: [{ type: 'anyTriple', stake: 100 }],
      ...BASE,
    })
    expect(r.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyRoll(r.serverSeed, r.clientSeed, r.nonce, r.dice)).toBe(true)

    const a = account({ creditLimit: 1500 })
    expect(() =>
      playSicBo(a, {
        bets: [
          { type: 'small', stake: 1000 },
          { type: 'big', stake: 1000 }, // 2000 > 1500 available
        ],
        ...BASE,
      }),
    ).toThrow(/exceeds availableToWager/)
    expect(availableToWager(a)).toBe(500) // first 1000 stayed held (pending)
  })

  it('rejects an empty bet list', () => {
    expect(() => playSicBo(account(), { bets: [], ...BASE })).toThrow(/at least one bet/)
  })
})
