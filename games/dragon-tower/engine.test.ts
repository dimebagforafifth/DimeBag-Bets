import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import { cashOut, createTowerGame, level, nextMultiplier, pickTile, revealProof } from './engine.js'
import { verifyTower } from './fair.js'
import { DIFFICULTIES, ROWS, towerMultiplier } from './difficulty.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 1000, balance: 0, pending: 0, ...overrides }
}

const SEEDS = { clientSeed: 'client', nonce: 1 } as const

/** The safe (egg) tile on the current row of a game. */
function egg(g: ReturnType<typeof createTowerGame>): number {
  const row = g.picks.length
  const tiles = DIFFICULTIES[g.difficulty].tiles
  return Array.from({ length: tiles }, (_, i) => i).find((t) => !g.layout[row].includes(t))!
}

describe('createTowerGame', () => {
  it('holds the stake in pending via core and commits the tower', () => {
    const a = account()
    const g = createTowerGame(a, { stake: 100, difficulty: 'medium', serverSeed: 'srv', ...SEEDS })
    expect(a.pending).toBe(100)
    expect(availableToWager(a)).toBe(900)
    expect(g.status).toBe('active')
    expect(g.layout).toHaveLength(ROWS)
    expect(g.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects a stake larger than availableToWager (delegated to core)', () => {
    const a = account()
    expect(() =>
      createTowerGame(a, { stake: 1001, difficulty: 'easy', serverSeed: 'srv', ...SEEDS }),
    ).toThrow(/exceeds availableToWager/)
    expect(a.pending).toBe(0)
  })
})

describe('pickTile', () => {
  it('climbs a row on an egg and raises the multiplier', () => {
    const a = account()
    const g = createTowerGame(a, { stake: 100, difficulty: 'easy', serverSeed: 'srv', ...SEEDS })
    const res = pickTile(a, g, egg(g))
    expect(res.hitSkull).toBe(false)
    expect(level(g)).toBe(1)
    expect(res.multiplier).toBe(towerMultiplier('easy', 1))
    expect(g.status).toBe('active')
  })

  it('busts on a skull and resolves the loss through core', () => {
    const a = account()
    const g = createTowerGame(a, { stake: 100, difficulty: 'hard', serverSeed: 'srv', ...SEEDS })
    const skull = g.layout[0][0]
    const res = pickTile(a, g, skull)
    expect(res.hitSkull).toBe(true)
    expect(g.status).toBe('busted')
    expect(g.bustRow).toBe(0)
    expect(g.bustTile).toBe(skull)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(-100)
  })

  it('auto-wins the top of the tower at the max multiplier', () => {
    const a = account()
    const g = createTowerGame(a, { stake: 100, difficulty: 'easy', serverSeed: 'srv', ...SEEDS })
    for (let r = 0; r < ROWS; r++) pickTile(a, g, egg(g))
    expect(g.status).toBe('cleared')
    expect(g.payoutMultiplier).toBe(towerMultiplier('easy', ROWS))
    expect(a.pending).toBe(0)
    // balance = profit = stake × (mult − 1)
    expect(a.balance).toBeCloseTo(100 * (towerMultiplier('easy', ROWS) - 1), 6)
  })

  it('refuses to pick after the round ends', () => {
    const a = account()
    const g = createTowerGame(a, { stake: 100, difficulty: 'hard', serverSeed: 'srv', ...SEEDS })
    pickTile(a, g, g.layout[0][0]) // bust
    expect(() => pickTile(a, g, 0)).toThrow(/game is busted/)
  })
})

describe('cashOut', () => {
  it('pays the current multiplier after at least one row', () => {
    const a = account()
    const g = createTowerGame(a, { stake: 200, difficulty: 'expert', serverSeed: 'srv', ...SEEDS })
    pickTile(a, g, egg(g))
    pickTile(a, g, egg(g))
    const mult = cashOut(a, g)
    expect(g.status).toBe('cashed')
    expect(mult).toBe(towerMultiplier('expert', 2))
    expect(a.pending).toBe(0)
    expect(a.balance).toBeCloseTo(200 * (mult - 1), 6)
  })

  it('refuses a level-0 cash-out', () => {
    const a = account()
    const g = createTowerGame(a, { stake: 100, difficulty: 'easy', serverSeed: 'srv', ...SEEDS })
    expect(() => cashOut(a, g)).toThrow(/at least one row/)
  })
})

describe('nextMultiplier', () => {
  it('previews the next rung and is null at the top', () => {
    const a = account()
    const g = createTowerGame(a, { stake: 100, difficulty: 'medium', serverSeed: 'srv', ...SEEDS })
    expect(nextMultiplier(g)).toBe(towerMultiplier('medium', 1))
    for (let r = 0; r < ROWS; r++) pickTile(a, g, egg(g))
    expect(nextMultiplier(g)).toBeNull()
  })
})

describe('revealProof', () => {
  it('is withheld mid-round and verifies once finished', () => {
    const a = account()
    const g = createTowerGame(a, { stake: 100, difficulty: 'master', serverSeed: 'srv', ...SEEDS })
    expect(() => revealProof(g)).toThrow(/only revealed after/)
    pickTile(a, g, egg(g))
    cashOut(a, g)
    const proof = revealProof(g)
    expect(verifyTower(proof.serverSeed, proof.clientSeed, proof.nonce, proof.difficulty, proof.layout)).toBe(
      true,
    )
  })
})
