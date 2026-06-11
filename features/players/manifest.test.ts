import { describe, it, expect } from 'vitest'
import { playersManifests } from './manifest.js'

describe('players manifests', () => {
  it('exposes the player tiles in the contract shape', () => {
    expect(playersManifests.map((m) => m.key)).toEqual([
      'players',
      'add-player',
      'cashier',
      'limits',
      'performance',
      'messaging',
      // ported from the old manager console
      'vip',
      'loyalty',
      'segments',
      'notes',
      'promotions',
    ])
    for (const m of playersManifests) {
      expect(m.section).toBe('players')
      expect(m.name.length).toBeGreaterThan(0)
      expect(m.hint.length).toBeGreaterThan(0)
      expect(m.icon).toBeTruthy() // a (lucide-shaped) component
      expect(typeof m.Panel).toBe('function')
    }
  })

  it('uses play-money language (no payment-processing terms)', () => {
    const text = playersManifests.map((m) => `${m.name} ${m.hint}`.toLowerCase()).join(' ')
    // dollars are fine now; flag only real-cashier/payment terms.
    expect(text).not.toMatch(/deposit|withdraw|buy-in|cash-out|kyc/)
  })
})
