import { describe, it, expect } from 'vitest'
import type { Role } from '../../org/index.js'
import {
  ALL_CAPABILITIES,
  MANAGER_ONLY,
  ROLE_BASE,
  roleCeiling,
  effectiveCaps,
  can,
  isRoleDefault,
  type PermissionGrants,
} from './permissions.js'

const member = (id: string, role: Role) => ({ id, role })

describe('console permissions model', () => {
  it('a manager always holds every capability', () => {
    expect(effectiveCaps(member('mgr', 'manager'), {})).toEqual(ALL_CAPABILITIES)
    // …even if a (nonsensical) grant tried to restrict them.
    expect(effectiveCaps(member('mgr', 'manager'), { mgr: ['dashboard'] })).toEqual(
      ALL_CAPABILITIES,
    )
    for (const c of ALL_CAPABILITIES) expect(can(member('mgr', 'manager'), {}, c)).toBe(true)
  })

  it('non-managers fall back to their role default with no grant', () => {
    expect(effectiveCaps(member('s1', 'subagent'), {})).toEqual(ROLE_BASE.subagent)
    expect(effectiveCaps(member('a1', 'agent'), {})).toEqual(ROLE_BASE.agent)
    expect(effectiveCaps(member('p1', 'player'), {})).toEqual([])
    expect(isRoleDefault('s1', {})).toBe(true)
  })

  it('a custom grant replaces the role default for that member', () => {
    const grants: PermissionGrants = { a1: ['dashboard', 'reporting'] }
    expect(effectiveCaps(member('a1', 'agent'), grants)).toEqual(['dashboard', 'reporting'])
    expect(isRoleDefault('a1', grants)).toBe(false)
    // a different member with no entry is unaffected
    expect(effectiveCaps(member('a2', 'agent'), grants)).toEqual(ROLE_BASE.agent)
  })

  it('grants are clamped to the role ceiling — admin tools can never be delegated', () => {
    // Try to hand a sub-agent the manager-only tools.
    const grants: PermissionGrants = { s1: ['dashboard', ...MANAGER_ONLY] }
    const caps = effectiveCaps(member('s1', 'subagent'), grants)
    expect(caps).toContain('dashboard')
    for (const c of MANAGER_ONLY) expect(caps).not.toContain(c)
    expect(can(member('s1', 'subagent'), grants, 'permissions')).toBe(false)
    expect(can(member('s1', 'subagent'), grants, 'setup')).toBe(false)
  })

  it('the role ceiling excludes admin-only tools for non-managers but allows them for a manager', () => {
    for (const c of MANAGER_ONLY) {
      expect(roleCeiling('subagent')).not.toContain(c)
      expect(roleCeiling('agent')).not.toContain(c)
      expect(roleCeiling('manager')).toContain(c)
    }
  })

  it('output is canonically ordered and de-duplicated regardless of grant order', () => {
    const grants: PermissionGrants = { a1: ['reporting', 'dashboard', 'reporting', 'players'] }
    expect(effectiveCaps(member('a1', 'agent'), grants)).toEqual([
      'dashboard',
      'players',
      'reporting',
    ])
  })
})
