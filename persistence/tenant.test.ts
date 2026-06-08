import { describe, it, expect, afterEach } from 'vitest'
import {
  DEFAULT_TENANT,
  getActiveTenant,
  hasTenant,
  setActiveTenant,
  subscribeTenant,
  tenantNamespace,
  __resetTenant,
} from './tenant.js'
import { createLocalStore, type StorageLike } from './store.js'

/** A minimal in-memory Web Storage stand-in (mirrors store.test.ts). */
function fakeStorage(): StorageLike {
  const m = new Map<string, string>()
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    get length() {
      return m.size
    },
    key: (i) => [...m.keys()][i] ?? null,
    // expose raw keys for assertions
    rawKeys: () => [...m.keys()],
  } as StorageLike & { rawKeys(): string[] }
}

afterEach(() => __resetTenant())

describe('tenant context', () => {
  it('defaults to the default tenant and leaves the namespace unchanged', () => {
    expect(getActiveTenant()).toBe(DEFAULT_TENANT)
    expect(hasTenant()).toBe(false)
    expect(tenantNamespace('dimebag')).toBe('dimebag') // today's exact keyspace
  })

  it('suffixes the namespace for a real tenant, distinct from the default', () => {
    setActiveTenant('acme')
    expect(hasTenant()).toBe(true)
    expect(tenantNamespace('dimebag')).toBe('dimebag~t~acme')
    // cannot prefix-collide with the default 'dimebag:' keyspace
    expect('dimebag~t~acme'.startsWith('dimebag:')).toBe(false)
  })

  it('sanitises unsafe characters in the tenant id', () => {
    setActiveTenant('a/c me.co')
    expect(tenantNamespace('dimebag')).toBe('dimebag~t~a_c_me_co')
  })

  it('an empty/null id resets to the default tenant', () => {
    setActiveTenant('acme')
    setActiveTenant(null)
    expect(getActiveTenant()).toBe(DEFAULT_TENANT)
    setActiveTenant('acme')
    setActiveTenant('')
    expect(getActiveTenant()).toBe(DEFAULT_TENANT)
  })

  it('notifies subscribers on change, not on a no-op', () => {
    let hits = 0
    const off = subscribeTenant(() => (hits += 1))
    setActiveTenant('acme')
    setActiveTenant('acme') // unchanged → no notify
    setActiveTenant('zenith')
    off()
    setActiveTenant('acme') // after unsubscribe → no notify
    expect(hits).toBe(2)
  })
})

describe('two tenants are provably isolated (local storage)', () => {
  it('stores under one shared backing never see each other across tenants', () => {
    const backing = fakeStorage()

    setActiveTenant('acme')
    const acme = createLocalStore({ namespace: 'dimebag', backing })
    acme.set('book.org', { managerId: 'acme-mgr' })
    acme.set('settings.config', { creditLimit: 100 })

    setActiveTenant('zenith')
    const zenith = createLocalStore({ namespace: 'dimebag', backing })
    // Zenith's book is empty — it CANNOT read Acme's data.
    expect(zenith.get('book.org')).toBeNull()
    expect(zenith.keys()).toEqual([])
    zenith.set('book.org', { managerId: 'zenith-mgr' })

    // Each tenant sees only its own book.
    expect(zenith.get('book.org')).toEqual({ managerId: 'zenith-mgr' })

    setActiveTenant('acme')
    const acme2 = createLocalStore({ namespace: 'dimebag', backing })
    expect(acme2.get('book.org')).toEqual({ managerId: 'acme-mgr' }) // intact, unchanged
    expect(acme2.get('settings.config')).toEqual({ creditLimit: 100 })

    // The raw backing keeps them in fully separate, namespaced keyspaces.
    const raw = (backing as unknown as { rawKeys(): string[] }).rawKeys()
    expect(raw).toContain('dimebag~t~acme:book.org')
    expect(raw).toContain('dimebag~t~zenith:book.org')
    // and clearing one tenant never touches the other
    acme2.clear()
    setActiveTenant('zenith')
    expect(createLocalStore({ namespace: 'dimebag', backing }).get('book.org')).toEqual({
      managerId: 'zenith-mgr',
    })
  })

  it('the default tenant keyspace is untouched by either real tenant', () => {
    const backing = fakeStorage()
    const base = createLocalStore({ namespace: 'dimebag', backing }) // default tenant
    base.set('book.org', { managerId: 'mgr' })

    setActiveTenant('acme')
    expect(createLocalStore({ namespace: 'dimebag', backing }).get('book.org')).toBeNull()

    __resetTenant()
    expect(createLocalStore({ namespace: 'dimebag', backing }).get('book.org')).toEqual({
      managerId: 'mgr',
    })
    const raw = (backing as unknown as { rawKeys(): string[] }).rawKeys()
    expect(raw).toContain('dimebag:book.org') // default keyspace preserved exactly
  })
})
