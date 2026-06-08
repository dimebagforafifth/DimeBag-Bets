// @vitest-environment happy-dom
/**
 * Tenant isolation through the env-aware `createStore` selector over REAL localStorage
 * (happy-dom). With no Supabase keys, createStore falls back to a tenant-scoped local
 * store; two tenants writing the same logical key land in separate keyspaces in the one
 * shared localStorage — neither can read the other.
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { createStore } from './select.js'
import { setActiveTenant, __resetTenant } from './tenant.js'

beforeEach(() => localStorage.clear())
afterEach(() => {
  __resetTenant()
  localStorage.clear()
})

describe('createStore tenant isolation (real localStorage)', () => {
  it('two operators never see each other’s data; the default keyspace is separate too', () => {
    setActiveTenant('acme')
    createStore({ namespace: 'dimebag', envSource: {} }).set('book.org', { mgr: 'acme' })

    setActiveTenant('zenith')
    const zenith = createStore({ namespace: 'dimebag', envSource: {} })
    expect(zenith.get('book.org')).toBeNull() // cannot read acme's book
    zenith.set('book.org', { mgr: 'zenith' })

    setActiveTenant('acme')
    expect(createStore({ namespace: 'dimebag', envSource: {} }).get('book.org')).toEqual({ mgr: 'acme' })

    __resetTenant() // default tenant
    expect(createStore({ namespace: 'dimebag', envSource: {} }).get('book.org')).toBeNull()

    // separate, namespaced localStorage keys under the hood
    const keys = Object.keys(localStorage)
    expect(keys).toContain('dimebag~t~acme:book.org')
    expect(keys).toContain('dimebag~t~zenith:book.org')
    expect(keys).not.toContain('dimebag:book.org') // default book was never written
  })
})
