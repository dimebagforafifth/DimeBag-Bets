import { describe, it, expect, beforeEach } from 'vitest'
import {
  grantedTiles,
  isTileGranted,
  setAgentTile,
  resetAgentPermissions,
  __resetAllAgentPermissions,
  DEFAULT_AGENT_KEYS,
  AGENT_GRANTABLE_KEYS,
} from './agent-permissions.js'

beforeEach(() => __resetAllAgentPermissions())

describe('agent permissions', () => {
  it('a new agent gets the default grant set', () => {
    expect([...grantedTiles('a1')].sort()).toEqual([...DEFAULT_AGENT_KEYS].sort())
    expect(isTileGranted('a1', 'players')).toBe(true)
    expect(isTileGranted('a1', 'performance')).toBe(false) // not in the default set
  })

  it('the manager grants and revokes individual tiles', () => {
    setAgentTile('a1', 'performance', true)
    expect(isTileGranted('a1', 'performance')).toBe(true)
    setAgentTile('a1', 'players', false)
    expect(isTileGranted('a1', 'players')).toBe(false)
  })

  it('never grants a tile outside the grantable allow-list', () => {
    setAgentTile('a1', 'settings', true) // manager-only — must be ignored
    setAgentTile('a1', 'agents', true)
    expect(isTileGranted('a1', 'settings')).toBe(false)
    expect(isTileGranted('a1', 'agents')).toBe(false)
    // everything granted is always within the allow-list
    for (const k of grantedTiles('a1')) expect(AGENT_GRANTABLE_KEYS).toContain(k)
  })

  it('reset returns an agent to the default set', () => {
    setAgentTile('a1', 'players', false)
    setAgentTile('a1', 'ledger', true)
    resetAgentPermissions('a1')
    expect([...grantedTiles('a1')].sort()).toEqual([...DEFAULT_AGENT_KEYS].sort())
  })

  it('agents are independent of each other', () => {
    setAgentTile('a1', 'players', false)
    expect(isTileGranted('a1', 'players')).toBe(false)
    expect(isTileGranted('a2', 'players')).toBe(true) // a2 untouched → default
  })
})
