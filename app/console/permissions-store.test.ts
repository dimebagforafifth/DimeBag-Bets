import { describe, it, expect, afterEach } from 'vitest'
import {
  getGrant,
  setGrant,
  clearGrant,
  getGrants,
  __resetPermissions,
} from './permissions-store.js'

// The store is a module singleton over the shared KV; reset after each test so they
// stay independent.
afterEach(() => __resetPermissions())

describe('permissions-store', () => {
  it('a member with no entry has no grant (falls back to role default)', () => {
    expect(getGrant('s1')).toBeNull()
  })

  it('saves and reads back a custom grant', () => {
    setGrant('s1', ['dashboard', 'reporting'])
    expect(getGrant('s1')).toEqual(['dashboard', 'reporting'])
    expect(getGrants().s1).toEqual(['dashboard', 'reporting'])
  })

  it('drops unknown capability strings on save', () => {
    setGrant('a1', ['dashboard', 'not-a-cap' as never, 'reporting'])
    expect(getGrant('a1')).toEqual(['dashboard', 'reporting'])
  })

  it('clearing a grant reverts the member to no entry', () => {
    setGrant('s1', ['dashboard'])
    clearGrant('s1')
    expect(getGrant('s1')).toBeNull()
    expect('s1' in getGrants()).toBe(false)
  })
})
