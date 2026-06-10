import { describe, it, expect } from 'vitest'
import { playersManifests } from './manifest.js'

describe('players manifests', () => {
  it('exposes the seven player tiles in the contract shape', () => {
    expect(playersManifests.map((m) => m.key)).toEqual([
      'players',
      'add-player',
      'player-pending',
      'limits',
      'analysis',
      'sessions',
      'performance',
    ])
    for (const m of playersManifests) {
      expect(m.section).toBe('players')
      expect(m.name.length).toBeGreaterThan(0)
      expect(m.hint.length).toBeGreaterThan(0)
      expect(m.icon).toBeTruthy() // a real lucide-react icon component
      expect(typeof m.Panel).toBe('function')
    }
  })

  it('keys are unique', () => {
    const keys = playersManifests.map((m) => m.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('uses coins/points language — no real-money terms', () => {
    const text = playersManifests.map((m) => `${m.name} ${m.hint}`.toLowerCase()).join(' ')
    expect(text).not.toMatch(/dollar|\bmoney\b|deposit|withdraw|\bcash\b|real-money/)
  })

  it('surfaces no agent / hierarchy language', () => {
    const text = playersManifests.map((m) => `${m.name} ${m.hint}`.toLowerCase()).join(' ')
    expect(text).not.toMatch(/\bagent\b|sub-?agent|master|super-?agent|downline|upline/)
  })
})
