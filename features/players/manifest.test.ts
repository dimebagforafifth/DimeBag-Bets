import { describe, it, expect } from 'vitest'
import { playersManifests } from './manifest.js'

describe('players manifests', () => {
  it('exposes the six player tiles in the contract shape', () => {
    expect(playersManifests.map((m) => m.key)).toEqual([
      'players',
      'add-player',
      'cashier',
      'limits',
      'performance',
      'messaging',
    ])
    for (const m of playersManifests) {
      expect(m.section).toBe('players')
      expect(m.name.length).toBeGreaterThan(0)
      expect(m.hint.length).toBeGreaterThan(0)
      expect(m.icon).toBeTruthy() // a (lucide-shaped) component
      expect(typeof m.Panel).toBe('function')
    }
  })

  it('uses points/coin language (no real-money terms)', () => {
    const text = playersManifests.map((m) => `${m.name} ${m.hint}`.toLowerCase()).join(' ')
    // "Cashier" is the brief's sanctioned tile name; flag actual real-money terms.
    expect(text).not.toMatch(/dollar|\bmoney\b|deposit|withdraw|real-money/)
  })
})
