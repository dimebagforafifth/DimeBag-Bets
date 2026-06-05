import { describe, it, expect } from 'vitest'
import { deriveMines, hashServerSeed, verifyMines } from './fair.js'

const SERVER = 'server-seed-abc123'
const CLIENT = 'player-seed-xyz'

describe('deriveMines', () => {
  it('is deterministic for the same seeds + nonce', () => {
    const a = deriveMines(SERVER, CLIENT, 1, 5)
    const b = deriveMines(SERVER, CLIENT, 1, 5)
    expect(a).toEqual(b)
  })

  it('places exactly mineCount mines, all unique and in range', () => {
    for (const mineCount of [1, 3, 12, 24]) {
      const mines = deriveMines(SERVER, CLIENT, 7, mineCount)
      expect(mines).toHaveLength(mineCount)
      expect(new Set(mines).size).toBe(mineCount) // unique
      for (const tile of mines) {
        expect(tile).toBeGreaterThanOrEqual(0)
        expect(tile).toBeLessThan(25)
      }
    }
  })

  it('changes the layout when the nonce changes', () => {
    const n1 = deriveMines(SERVER, CLIENT, 1, 5)
    const n2 = deriveMines(SERVER, CLIENT, 2, 5)
    expect(n1).not.toEqual(n2)
  })

  it('changes the layout when the client seed changes', () => {
    const c1 = deriveMines(SERVER, 'seed-A', 1, 5)
    const c2 = deriveMines(SERVER, 'seed-B', 1, 5)
    expect(c1).not.toEqual(c2)
  })

  it('returns positions sorted ascending', () => {
    const mines = deriveMines(SERVER, CLIENT, 9, 8)
    expect([...mines].sort((a, b) => a - b)).toEqual(mines)
  })

  it('spreads first-mine positions roughly uniformly across the board', () => {
    // Sanity check on the RNG: over many nonces, every tile should host the
    // first mine at least once (no dead zones).
    const seen = new Set<number>()
    for (let nonce = 0; nonce < 2000; nonce++) {
      seen.add(deriveMines(SERVER, CLIENT, nonce, 1)[0])
    }
    expect(seen.size).toBe(25)
  })
})

describe('hashServerSeed', () => {
  it('is a stable 64-char hex SHA-256 commitment', () => {
    const h = hashServerSeed(SERVER)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashServerSeed(SERVER)).toBe(h)
  })
})

describe('verifyMines', () => {
  it('confirms a layout re-derived from the same seeds', () => {
    const mines = deriveMines(SERVER, CLIENT, 4, 6)
    expect(verifyMines(SERVER, CLIENT, 4, 6, mines)).toBe(true)
  })

  it('rejects a tampered layout or wrong seeds', () => {
    const mines = deriveMines(SERVER, CLIENT, 4, 6)
    const tampered = [...mines]
    tampered[0] = (tampered[0] + 1) % 25
    expect(verifyMines(SERVER, CLIENT, 4, 6, tampered)).toBe(false)
    expect(verifyMines('other-server', CLIENT, 4, 6, mines)).toBe(false)
  })
})
