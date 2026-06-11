import { describe, it, expect } from 'vitest'
import {
  addAgent,
  addPlayer,
  addSubAgent,
  agentCommission,
  agentOf,
  agentPerformance,
  agentPlayerNet,
  allAgents,
  createOrg,
  getMember,
  rosterOf,
  setCommissionPct,
  type Org,
} from './index.js'

/**
 *   manager
 *     └── master (sa)  commission 10%
 *           └── agent (a)  commission 25%
 *                 ├── player p1  (−4,000 → down)
 *                 └── player p2  (+1,000 → up)
 */
function tree(): Org {
  const org = createOrg({ name: 'Book', creditLimit: 100_000_000, id: 'mgr' })
  addSubAgent(org, { name: 'Master', creditLimit: 10_000_000, id: 'sa' })
  addAgent(org, 'sa', { name: 'Agent', creditLimit: 2_000_000, id: 'a' })
  addPlayer(org, 'a', { name: 'P1', creditLimit: 50_000, id: 'p1' })
  addPlayer(org, 'a', { name: 'P2', creditLimit: 50_000, id: 'p2' })
  getMember(org, 'p1').account.balance = -4_000 // owes the book (lost)
  getMember(org, 'p2').account.balance = 1_000 // up
  return org
}

describe('setCommissionPct', () => {
  it('sets and clears a split on an agent / master agent only', () => {
    const org = tree()
    setCommissionPct(org, 'a', 25)
    expect(getMember(org, 'a').commissionPct).toBe(25)
    setCommissionPct(org, 'sa', 10)
    expect(getMember(org, 'sa').commissionPct).toBe(10)
    setCommissionPct(org, 'a', null)
    expect(getMember(org, 'a').commissionPct).toBeUndefined()
    setCommissionPct(org, 'sa', 0) // 0 clears too
    expect(getMember(org, 'sa').commissionPct).toBeUndefined()
  })

  it('rejects a split on a player or the manager, and out-of-range', () => {
    const org = tree()
    expect(() => setCommissionPct(org, 'p1', 10)).toThrow(/agents and master agents/)
    expect(() => setCommissionPct(org, 'mgr', 10)).toThrow(/agents and master agents/)
    expect(() => setCommissionPct(org, 'a', 150)).toThrow(/0–100/)
    expect(() => setCommissionPct(org, 'a', -5)).toThrow(/0–100/)
  })
})

describe('roster + net', () => {
  it('rosterOf returns every player in the subtree', () => {
    expect(rosterOf(tree(), 'a').map((p) => p.id).sort()).toEqual(['p1', 'p2'])
    expect(rosterOf(tree(), 'sa').map((p) => p.id).sort()).toEqual(['p1', 'p2'])
    expect(rosterOf(tree(), 'p1')).toEqual([]) // a player has no roster
  })

  it('agentPlayerNet sums the roster balances', () => {
    expect(agentPlayerNet(tree(), 'a')).toBe(-3_000) // -4,000 + 1,000
  })
})

describe('agentCommission', () => {
  it('is a percent of the roster net LOSS, zero when up or no split', () => {
    const org = tree()
    expect(agentCommission(org, 'a')).toBe(0) // no split set yet
    setCommissionPct(org, 'a', 25)
    expect(agentCommission(org, 'a')).toBe(750) // 25% of 3,000 lost
    // when the roster is net up, the agent earns nothing
    getMember(org, 'p1').account.balance = 5_000
    expect(agentPlayerNet(org, 'a')).toBe(6_000)
    expect(agentCommission(org, 'a')).toBe(0)
  })
})

describe('agentPerformance', () => {
  it('reports roster, sub-agents, net, exposure, and commission', () => {
    const org = tree()
    setCommissionPct(org, 'sa', 10)
    getMember(org, 'p1').account.pending = 800
    const perf = agentPerformance(org, 'sa')
    expect(perf).toMatchObject({
      agentId: 'sa',
      role: 'subagent',
      roster: 2, // p1, p2
      subAgents: 1, // the agent a
      playerNet: -3_000,
      exposure: 800,
      commissionPct: 10,
      commission: 300, // 10% of 3,000 lost
    })
  })
})

describe('allAgents', () => {
  it('lists every agent + master agent, master agents first', () => {
    expect(allAgents(tree()).map((m) => m.id)).toEqual(['sa', 'a'])
  })
})

describe('agentOf', () => {
  it('returns the nearest agent/master ancestor, or null under the manager', () => {
    const org = tree()
    expect(agentOf(org, 'p1')?.id).toBe('a') // nearest agent above the player
    expect(agentOf(org, 'a')?.id).toBe('sa') // an agent reports up to its master
    expect(agentOf(org, 'sa')).toBeNull() // a master sits under the manager
    addPlayer(org, 'mgr', { name: 'Direct', creditLimit: 1000, id: 'pd' })
    expect(agentOf(org, 'pd')).toBeNull() // player straight under the manager
  })
})
