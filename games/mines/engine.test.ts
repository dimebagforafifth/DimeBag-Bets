import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import {
  createMinesGame,
  revealTile,
  cashOut,
  currentMultiplier,
  nextMultiplier,
  revealProof,
} from './engine.js'
import { verifyMines } from './fair.js'
import { HOUSE_EDGE, minesMultiplier } from './multiplier.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 1000, balance: 0, pending: 0, ...overrides }
}

const SEEDS = { clientSeed: 'client', nonce: 1 } as const

/** Create a game and return a safe (non-mine) tile to click. */
function game(account: Account, stake: number, mineCount: number, serverSeed = 'srv') {
  const g = createMinesGame(account, { stake, mineCount, serverSeed, ...SEEDS })
  const firstSafe = Array.from({ length: 25 }, (_, i) => i).find((t) => !g.mines.includes(t))!
  return { g, firstSafe }
}

describe('createMinesGame', () => {
  it('holds the stake in pending via core', () => {
    const a = account()
    const { g } = game(a, 100, 3)
    expect(a.pending).toBe(100)
    expect(a.balance).toBe(0)
    expect(availableToWager(a)).toBe(900)
    expect(g.status).toBe('active')
    expect(g.mines).toHaveLength(3)
    expect(g.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects a stake larger than availableToWager (delegated to core)', () => {
    const a = account()
    expect(() => game(a, 1001, 3)).toThrow(/exceeds availableToWager/)
    expect(a.pending).toBe(0)
  })

  it('rejects an invalid mine count', () => {
    expect(() => game(account(), 100, 0)).toThrow(/mineCount/)
    expect(() => game(account(), 100, 25)).toThrow(/mineCount/)
  })
})

describe('revealTile', () => {
  it('a safe reveal keeps the game active and raises the multiplier', () => {
    const a = account()
    const { g, firstSafe } = game(a, 100, 3)
    const before = currentMultiplier(g)
    const res = revealTile(a, g, firstSafe)
    expect(res.hitMine).toBe(false)
    expect(res.status).toBe('active')
    expect(res.multiplier).toBeGreaterThan(before)
    expect(g.revealed).toEqual([firstSafe])
    expect(a.pending).toBe(100) // still held
  })

  it('hitting a mine busts the round and resolves a loss through core', () => {
    const a = account()
    const { g } = game(a, 100, 3)
    const mine = g.mines[0]
    const res = revealTile(a, g, mine)
    expect(res.hitMine).toBe(true)
    expect(res.status).toBe('busted')
    expect(a.pending).toBe(0) // hold released
    expect(a.balance).toBe(-100) // stake lost
  })

  it('rejects revealing the same tile twice and revealing after the round ends', () => {
    const a = account()
    const { g, firstSafe } = game(a, 100, 3)
    revealTile(a, g, firstSafe)
    expect(() => revealTile(a, g, firstSafe)).toThrow(/already revealed/)

    const mine = g.mines[0]
    revealTile(a, g, mine) // bust
    expect(() => revealTile(a, g, firstSafe)).toThrow(/game is busted/)
  })

  it('clearing every safe tile auto-wins at the top multiplier', () => {
    const a = account()
    // 24 mines -> exactly 1 safe tile; revealing it clears the board.
    const { g, firstSafe } = game(a, 100, 24)
    const res = revealTile(a, g, firstSafe)
    expect(res.status).toBe('cleared')
    expect(a.pending).toBe(0)
    // 24 mines, 1 gem: 0.99 × 25 = 24.75 → profit = 100 × 23.75 = 2375
    expect(g.payoutMultiplier).toBe(24.75)
    expect(a.balance).toBe(Math.round(100 * (24.75 - 1)))
  })
})

describe('cashOut', () => {
  it('resolves a win at the current multiplier and releases the hold', () => {
    const a = account()
    const { g, firstSafe } = game(a, 200, 3)
    revealTile(a, g, firstSafe)
    const mult = currentMultiplier(g)
    const paid = cashOut(a, g)
    expect(paid).toBe(mult)
    expect(g.status).toBe('cashed')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(Math.round(200 * (mult - 1)))
  })

  it('refuses to cash out before any reveal', () => {
    const a = account()
    const { g } = game(a, 100, 3)
    expect(() => cashOut(a, g)).toThrow(/before revealing/)
  })

  it('refuses to cash out an already-finished round', () => {
    const a = account()
    const { g, firstSafe } = game(a, 100, 3)
    revealTile(a, g, firstSafe)
    cashOut(a, g)
    expect(() => cashOut(a, g)).toThrow(/game is cashed/)
  })
})

describe('nextMultiplier', () => {
  it('previews the multiplier after one more safe reveal', () => {
    const a = account()
    const { g } = game(a, 100, 3)
    expect(nextMultiplier(g)).toBe(minesMultiplier(3, 1))
  })
})

describe('per-game house config (vig locked at bet time)', () => {
  it('defaults to the shipping config when none is supplied', () => {
    const { g } = game(account(), 100, 3)
    expect(g.config).toEqual({ houseEdge: HOUSE_EDGE, rounding: 'floor2' })
  })

  it('an exact-parity config pays full precision through core', () => {
    const a = account()
    const g = createMinesGame(a, {
      stake: 200,
      mineCount: 3,
      clientSeed: 'client',
      nonce: 1,
      serverSeed: 'srv',
      config: { houseEdge: 0.01, rounding: 'exact' },
    })
    const firstSafe = Array.from({ length: 25 }, (_, i) => i).find((t) => !g.mines.includes(t))!
    revealTile(a, g, firstSafe)
    const mult = currentMultiplier(g) // 0.99 × 25/22 = 1.125, not floored to 1.12
    expect(mult).toBeCloseTo(0.99 * (25 / 22), 10)
    cashOut(a, g)
    expect(a.balance).toBe(Math.round(200 * (mult - 1)))
  })
})

describe('provably-fair proof', () => {
  it('is withheld while active and verifiable once the round ends', () => {
    const a = account()
    const { g, firstSafe } = game(a, 100, 3)
    expect(() => revealProof(g)).toThrow(/after the round ends/)

    revealTile(a, g, firstSafe)
    cashOut(a, g)
    const proof = revealProof(g)
    expect(verifyMines(proof.serverSeed, proof.clientSeed, proof.nonce, proof.mineCount, proof.mines)).toBe(true)
  })
})

describe('full lifecycle leaves the figure consistent', () => {
  it('place → reveals → cash out: pending back to 0, balance reflects profit', () => {
    const a = account({ balance: 50 })
    const { g, firstSafe } = game(a, 100, 1) // 1 mine, low volatility
    revealTile(a, g, firstSafe)
    const second = Array.from({ length: 25 }, (_, i) => i).find(
      (t) => !g.mines.includes(t) && !g.revealed.includes(t),
    )!
    revealTile(a, g, second)
    const mult = currentMultiplier(g)
    cashOut(a, g)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(50 + Math.round(100 * (mult - 1)))
  })
})
