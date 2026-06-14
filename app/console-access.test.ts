import { describe, it, expect, beforeEach } from 'vitest'
import { registryForRole } from './console-access.js'
import { setAgentTile, __resetAllAgentPermissions } from './agent-permissions.js'
import type { FeatureManifest } from '../console/registry/types.js'

const tile = (key: string, section: FeatureManifest['section']): FeatureManifest => ({
  key,
  name: key,
  hint: '',
  section,
  icon: (() => null) as unknown as FeatureManifest['icon'],
  Panel: (() => null) as unknown as FeatureManifest['Panel'],
})

const REG: FeatureManifest[] = [
  tile('players', 'players'),
  tile('customer-admin', 'players'),
  tile('settings', 'control'), // manager-only
  tile('agents', 'players'), // manager-only
  tile('performance', 'players'), // grantable but off by default
]

beforeEach(() => __resetAllAgentPermissions())

describe('registryForRole', () => {
  it('a manager sees the whole registry', () => {
    expect(registryForRole(REG, 'manager', 'mgr')).toHaveLength(REG.length)
  })

  it('a player sees nothing (belt-and-braces; the section is also blocked)', () => {
    expect(registryForRole(REG, 'player', 'p1')).toEqual([])
  })

  it('an agent sees only granted tiles, never manager-only ones', () => {
    const keys = registryForRole(REG, 'agent', 'a1').map((m) => m.key)
    // default grant includes players + customer-admin; not settings/agents/performance
    expect(keys).toContain('players')
    expect(keys).toContain('customer-admin')
    expect(keys).not.toContain('settings')
    expect(keys).not.toContain('agents')
    expect(keys).not.toContain('performance')
  })

  it('reflects the manager granting/revoking a tile for that agent', () => {
    setAgentTile('a1', 'performance', true)
    setAgentTile('a1', 'players', false)
    const keys = registryForRole(REG, 'agent', 'a1').map((m) => m.key)
    expect(keys).toContain('performance') // newly granted
    expect(keys).not.toContain('players') // revoked
    // granting a manager-only tile is impossible
    setAgentTile('a1', 'settings', true)
    expect(registryForRole(REG, 'agent', 'a1').map((m) => m.key)).not.toContain('settings')
  })
})
