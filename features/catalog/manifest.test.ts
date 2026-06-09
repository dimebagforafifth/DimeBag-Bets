import { describe, it, expect } from 'vitest'
import { catalogManifests } from './manifest.js'

describe('catalog manifests', () => {
  it('exposes the five catalog tiles in the contract shape', () => {
    expect(catalogManifests.map((m) => m.key)).toEqual(['lines', 'casino', 'ticketwriter', 'scores', 'gamification'])
    for (const m of catalogManifests) {
      expect(m.section).toBe('catalog')
      expect(m.name.length).toBeGreaterThan(0)
      expect(m.hint.length).toBeGreaterThan(0)
      expect(m.icon).toBeTruthy()
      expect(typeof m.Panel).toBe('function')
    }
  })
})
