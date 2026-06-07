import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import {
  cashOut,
  createPumpGame,
  currentMultiplier,
  nextMultiplier,
  pump,
  revealProof,
} from './engine.js'
import { derivePops, verifyPops } from './fair.js'
import { maxPumps, pumpMultiplier, type PumpDifficulty } from './multiplier.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 1000, balance: 0, pending: 0, ...overrides }
}

const SEEDS = { clientSeed: 'client', nonce: 1 } as const

/** Find a server seed whose derived pop set satisfies `pred` (keeps tests honest
 *  — we exercise the real layout, never mutate it). */
function seedWhere(difficulty: PumpDifficulty, pred: (pops: number[]) => boolean): string {
  for (let i = 0; i < 5000; i++) {
    const seed = `srv-${i}`
    if (pred(derivePops(seed, SEEDS.clientSeed, SEEDS.nonce, difficulty))) return seed
  }
  throw new Error('no matching seed found')
}

describe('createPumpGame', () => {
  it('holds the stake in pending via core and commits the layout', () => {
    const a = account()
    const g = createPumpGame(a, { stake: 100, difficulty: 'easy', serverSeed: 'srv', ...SEEDS })
    expect(a.pending).toBe(100)
    expect(availableToWager(a)).toBe(900)
    expect(g.status).toBe('active')
    expect(g.popPositions).toHaveLength(1)
    expect(g.maxPumps).toBe(24)
    expect(g.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects a stake larger than availableToWager (delegated to core)', () => {
    const a = account()
    expect(() =>
      createPumpGame(a, { stake: 1001, difficulty: 'easy', serverSeed: 'srv', ...SEEDS }),
    ).toThrow(/exceeds availableToWager/)
    expect(a.pending).toBe(0)
  })
})

describe('pump', () => {
  it('raises the multiplier on a safe pump', () => {
    const a = account()
    // a layout whose first pop is not cell 0, so the first pump is safe
    const serverSeed = seedWhere('easy', (p) => Math.min(...p) >= 2)
    const g = createPumpGame(a, { stake: 100, difficulty: 'easy', serverSeed, ...SEEDS })
    const res = pump(a, g)
    expect(res.popped).toBe(false)
    expect(g.pumps).toBe(1)
    expect(res.multiplier).toBe(pumpMultiplier('easy', 1))
  })

  it('pops on a pop cell and resolves the loss through core', () => {
    const a = account()
    const serverSeed = seedWhere('hard', (p) => Math.min(...p) >= 1) // first pump safe
    const g = createPumpGame(a, { stake: 100, difficulty: 'hard', serverSeed, ...SEEDS })
    const firstPop = Math.min(...g.popPositions)
    for (let i = 0; i < firstPop; i++) expect(pump(a, g).popped).toBe(false)
    const res = pump(a, g)
    expect(res.popped).toBe(true)
    expect(g.status).toBe('popped')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(-100)
  })

  it('auto-wins a full run at the top multiplier', () => {
    const a = account()
    // every pop crammed into the last cell ⇒ all 24 safe pumps available
    const serverSeed = seedWhere('easy', (p) => p[0] === 24)
    const g = createPumpGame(a, { stake: 100, difficulty: 'easy', serverSeed, ...SEEDS })
    for (let i = 0; i < maxPumps('easy'); i++) pump(a, g)
    expect(g.status).toBe('maxed')
    expect(g.payoutMultiplier).toBe(pumpMultiplier('easy', 24))
    expect(a.pending).toBe(0)
    expect(a.balance).toBeCloseTo(100 * (pumpMultiplier('easy', 24) - 1), 6)
  })

  it('refuses to pump after the round ends', () => {
    const a = account()
    const serverSeed = seedWhere('easy', (p) => p[0] === 0) // pops immediately
    const g = createPumpGame(a, { stake: 100, difficulty: 'easy', serverSeed, ...SEEDS })
    pump(a, g)
    expect(g.status).toBe('popped')
    expect(() => pump(a, g)).toThrow(/game is popped/)
  })
})

describe('cashOut', () => {
  it('pays the current multiplier after at least one pump', () => {
    const a = account()
    const serverSeed = seedWhere('medium', (p) => Math.min(...p) >= 3)
    const g = createPumpGame(a, { stake: 200, difficulty: 'medium', serverSeed, ...SEEDS })
    pump(a, g)
    pump(a, g)
    const mult = cashOut(a, g)
    expect(g.status).toBe('cashed')
    expect(mult).toBe(pumpMultiplier('medium', 2))
    expect(a.pending).toBe(0)
    expect(a.balance).toBeCloseTo(200 * (mult - 1), 6)
  })

  it('refuses a 0-pump cash-out', () => {
    const a = account()
    const g = createPumpGame(a, { stake: 100, difficulty: 'easy', serverSeed: 'srv', ...SEEDS })
    expect(() => cashOut(a, g)).toThrow(/at least once/)
  })
})

describe('nextMultiplier', () => {
  it('previews the next pump and is null at the ceiling', () => {
    const a = account()
    const g = createPumpGame(a, { stake: 100, difficulty: 'easy', serverSeed: 'srv', ...SEEDS })
    expect(nextMultiplier(g)).toBe(pumpMultiplier('easy', 1))
  })

  it('tracks the live multiplier after pumps', () => {
    const a = account()
    const serverSeed = seedWhere('easy', (p) => Math.min(...p) >= 3)
    const g = createPumpGame(a, { stake: 100, difficulty: 'easy', serverSeed, ...SEEDS })
    pump(a, g)
    expect(currentMultiplier(g)).toBe(pumpMultiplier('easy', 1))
    expect(nextMultiplier(g)).toBe(pumpMultiplier('easy', 2))
  })
})

describe('revealProof', () => {
  it('is withheld mid-round and verifies once finished', () => {
    const a = account()
    const serverSeed = seedWhere('easy', (p) => Math.min(...p) >= 1)
    const g = createPumpGame(a, { stake: 100, difficulty: 'easy', serverSeed, ...SEEDS })
    expect(() => revealProof(g)).toThrow(/only revealed after/)
    pump(a, g)
    cashOut(a, g)
    const proof = revealProof(g)
    expect(
      verifyPops(proof.serverSeed, proof.clientSeed, proof.nonce, proof.difficulty, proof.popPositions),
    ).toBe(true)
  })
})
