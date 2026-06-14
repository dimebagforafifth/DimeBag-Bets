import { describe, it, expect, afterEach } from 'vitest'
import {
  createOrg,
  addSubAgent,
  addAgent,
  addPlayer,
  getMember,
  type Org,
} from '../../org/index.js'
import { setViewer } from '../../app/viewer.js'
import { effectiveScopeId, scopedPlayers, inScope, scopeOptions, ALL_SCOPE } from './scope.js'

/**
 *   manager
 *     ├── agent A  → players pA1, pA2
 *     └── master M → agent B → player pB1
 */
function tree(): Org {
  const org = createOrg({ name: 'Book', creditLimit: 100_000_000, id: 'mgr' })
  addAgent(org, 'mgr', { name: 'Agent A', creditLimit: 1_000_000, id: 'A' })
  addSubAgent(org, { name: 'Master M', creditLimit: 5_000_000, id: 'M' })
  addAgent(org, 'M', { name: 'Agent B', creditLimit: 1_000_000, id: 'B' })
  addPlayer(org, 'A', { name: 'pA1', creditLimit: 50_000, id: 'pA1' })
  addPlayer(org, 'A', { name: 'pA2', creditLimit: 50_000, id: 'pA2' })
  addPlayer(org, 'B', { name: 'pB1', creditLimit: 50_000, id: 'pB1' })
  return org
}

afterEach(() => setViewer('mgr', 'manager')) // reset the singleton for other tests

describe('manager viewer — unclamped', () => {
  it('sees the whole book and can scope to any agent', () => {
    setViewer('mgr', 'manager')
    const org = tree()
    expect(scopedPlayers(org, ALL_SCOPE).map((p) => p.id).sort()).toEqual(['pA1', 'pA2', 'pB1'])
    expect(scopedPlayers(org, 'A').map((p) => p.id).sort()).toEqual(['pA1', 'pA2'])
    expect(scopeOptions(org)[0]).toEqual({ id: ALL_SCOPE, label: 'Whole book' })
  })
})

describe('agent viewer — clamped to their downline', () => {
  it('a request for the whole book collapses to the agent’s own roster', () => {
    setViewer('A', 'agent')
    const org = tree()
    expect(effectiveScopeId(org, ALL_SCOPE)).toBe('A')
    expect(scopedPlayers(org, ALL_SCOPE).map((p) => p.id).sort()).toEqual(['pA1', 'pA2'])
    // never sees another agent's player
    expect(inScope(org, ALL_SCOPE)('pB1')).toBe(false)
    expect(inScope(org, ALL_SCOPE)('pA1')).toBe(true)
  })

  it('cannot scope to another agent (request collapses to self)', () => {
    setViewer('A', 'agent')
    const org = tree()
    expect(effectiveScopeId(org, 'B')).toBe('A') // B is not in A's downline
    expect(scopedPlayers(org, 'B').map((p) => p.id).sort()).toEqual(['pA1', 'pA2'])
  })

  it('its scope options are only its own book (no other agents)', () => {
    setViewer('A', 'agent')
    const org = tree()
    expect(scopeOptions(org)).toEqual([{ id: 'A', label: 'Your book' }])
  })

  it('a master can drill into agents in its OWN downline only', () => {
    setViewer('M', 'subagent')
    const org = tree()
    // M can scope to B (in M's downline) but not to A
    expect(effectiveScopeId(org, 'B')).toBe('B')
    expect(effectiveScopeId(org, 'A')).toBe('M')
    const opts = scopeOptions(org).map((o) => o.id)
    expect(opts).toContain('M')
    expect(opts).toContain('B')
    expect(opts).not.toContain('A')
    void getMember(org, 'B') // sanity: B exists
  })
})
