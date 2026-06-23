import { describe, it, expect } from 'vitest'
import { addAgent, addPlayer, addSubAgent, createOrg, type Org } from '../../features/org/index.js'
import { planBonus, targetPlayers } from './promotions.js'

/** mgr → sa → a → {p1 active, p2 suspended}; p3 active straight under mgr. */
function tree(): Org {
  const org = createOrg({ name: 'Book', creditLimit: 100_000_000, id: 'mgr' })
  addSubAgent(org, { name: 'SA', creditLimit: 10_000_000, id: 'sa' })
  addAgent(org, 'sa', { name: 'A', creditLimit: 1_000_000, id: 'a' })
  addPlayer(org, 'a', { name: 'P1', creditLimit: 200_000, id: 'p1' })
  addPlayer(org, 'a', { name: 'P2', creditLimit: 200_000, id: 'p2' })
  addPlayer(org, 'mgr', { name: 'P3', creditLimit: 200_000, id: 'p3' })
  org.members['p2'].active = false // suspended
  return org
}

describe('targetPlayers', () => {
  it('a player target resolves to just that player', () => {
    expect(targetPlayers(tree(), 'p1').map((m) => m.id)).toEqual(['p1'])
  })
  it('an agent resolves to its downline players, active-only by default', () => {
    expect(targetPlayers(tree(), 'a').map((m) => m.id)).toEqual(['p1']) // p2 suspended → skipped
    expect(targetPlayers(tree(), 'a', { activeOnly: false }).map((m) => m.id).sort()).toEqual(['p1', 'p2'])
  })
  it('the manager resolves to the whole book (all active players)', () => {
    expect(targetPlayers(tree(), 'mgr').map((m) => m.id).sort()).toEqual(['p1', 'p3'])
  })
  it('throws on an unknown target', () => {
    expect(() => targetPlayers(tree(), 'nope')).toThrow(/no member/)
  })
})

describe('planBonus', () => {
  it('resolves players + computes per-player and total', () => {
    const plan = planBonus(tree(), { targetId: 'mgr', cents: 1000, type: 'bonus' })
    expect(plan.players.map((p) => p.id).sort()).toEqual(['p1', 'p3'])
    expect(plan.perPlayer).toBe(1000)
    expect(plan.total).toBe(2000)
  })
  it('rejects a non-positive or fractional amount', () => {
    expect(() => planBonus(tree(), { targetId: 'p1', cents: 0, type: 'bonus' })).toThrow(/positive/)
    expect(() => planBonus(tree(), { targetId: 'p1', cents: 12.5, type: 'bonus' })).toThrow(/positive/)
  })
  it('rejects a target with no eligible players', () => {
    const org = tree()
    org.members['p1'].active = false // now `a` has only suspended players
    expect(() => planBonus(org, { targetId: 'a', cents: 100, type: 'freeplay' })).toThrow(/no eligible/)
  })
})
