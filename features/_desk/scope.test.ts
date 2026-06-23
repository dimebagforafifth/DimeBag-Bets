import { describe, it, expect } from 'vitest'
import { addAgent, addPlayer, addSubAgent, createOrg, type Org } from '../org/index.js'
import { ALL_SCOPE, inScope, scopedPlayers, scopeOptions } from './scope.js'

/** mgr → master(sa) → agent(a) → {p1, p2}; player p3 straight under the manager. */
function tree(): Org {
  const org = createOrg({ name: 'Book', creditLimit: 100_000_000, id: 'mgr' })
  addSubAgent(org, { name: 'Master', creditLimit: 10_000_000, id: 'sa' })
  addAgent(org, 'sa', { name: 'Agent', creditLimit: 2_000_000, id: 'a' })
  addPlayer(org, 'a', { name: 'P1', creditLimit: 50_000, id: 'p1' })
  addPlayer(org, 'a', { name: 'P2', creditLimit: 50_000, id: 'p2' })
  addPlayer(org, 'mgr', { name: 'P3', creditLimit: 50_000, id: 'p3' })
  return org
}

describe('agent scope', () => {
  it('ALL_SCOPE returns every player in the book', () => {
    expect(scopedPlayers(tree(), ALL_SCOPE).map((p) => p.id).sort()).toEqual(['p1', 'p2', 'p3'])
  })

  it('an agent scope returns only that agent/master roster', () => {
    expect(scopedPlayers(tree(), 'a').map((p) => p.id).sort()).toEqual(['p1', 'p2'])
    expect(scopedPlayers(tree(), 'sa').map((p) => p.id).sort()).toEqual(['p1', 'p2']) // master's whole subtree
  })

  it('inScope filters by roster membership', () => {
    const org = tree()
    const f = inScope(org, 'a')
    expect(f('p1')).toBe(true)
    expect(f('p3')).toBe(false) // not under agent a
    expect(inScope(org, ALL_SCOPE)('p3')).toBe(true) // whole book
  })

  it('scopeOptions lists Whole book + every agent (masters first)', () => {
    expect(scopeOptions(tree()).map((o) => o.id)).toEqual([ALL_SCOPE, 'sa', 'a'])
  })
})
