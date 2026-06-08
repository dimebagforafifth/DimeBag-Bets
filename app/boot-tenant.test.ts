// @vitest-environment happy-dom
/**
 * Shell-boot tenant activation: the active book is set from the session's tenantId before
 * the stores initialise. A signed-in operator with a tenantId gets their own scoped book;
 * no session / no tenantId falls back to the default tenant = today's exact behaviour.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createLocalStore,
  persistedDoc,
  createStore,
  getActiveTenant,
  __resetTenant,
  DEFAULT_TENANT,
} from '../persistence/index.js'
import { activateTenantFromBoot } from './boot-tenant.js'
import type { Session } from '../auth/types.js'

function seedSession(s: Session | null): void {
  // Auth lives at the default namespace (same place demoAdapter writes it).
  const store = createLocalStore({ namespace: 'dimebag' })
  persistedDoc<Session | null>(store, 'auth.session', { version: 1, initial: null }).save(s)
}
const session = (tenantId?: string): Session => ({
  user: { id: 'mgr', email: 'op@dimebag.local', displayName: 'Operator', tenantId },
  token: 'demo',
  expiresAt: null,
})

beforeEach(() => {
  localStorage.clear()
  __resetTenant()
})
afterEach(() => {
  __resetTenant()
  localStorage.clear()
})

describe('boot tenant activation', () => {
  it('a signed-in operator with a tenantId gets their own scoped book', () => {
    seedSession(session('acme'))
    activateTenantFromBoot()
    expect(getActiveTenant()).toBe('acme')

    // A store created AFTER boot is scoped to that operator's book keyspace.
    createStore({ namespace: 'dimebag', envSource: {} }).set('book.org', { mgr: 'acme' })
    expect(Object.keys(localStorage)).toContain('dimebag~t~acme:book.org')
    expect(Object.keys(localStorage)).not.toContain('dimebag:book.org')
  })

  it('no session falls back to the default tenant (unchanged behaviour)', () => {
    activateTenantFromBoot() // nothing seeded
    expect(getActiveTenant()).toBe(DEFAULT_TENANT)
    createStore({ namespace: 'dimebag', envSource: {} }).set('book.org', { mgr: 'default' })
    expect(Object.keys(localStorage)).toContain('dimebag:book.org') // today's exact keyspace
  })

  it('a session with no tenantId (the demo) also stays on the default tenant', () => {
    seedSession(session(undefined))
    activateTenantFromBoot()
    expect(getActiveTenant()).toBe(DEFAULT_TENANT)
  })

  it('two operators land in fully separate books', () => {
    seedSession(session('acme'))
    activateTenantFromBoot()
    createStore({ namespace: 'dimebag', envSource: {} }).set('book.org', { mgr: 'acme' })

    seedSession(session('zenith'))
    activateTenantFromBoot()
    expect(getActiveTenant()).toBe('zenith')
    const zenith = createStore({ namespace: 'dimebag', envSource: {} })
    expect(zenith.get('book.org')).toBeNull() // cannot see acme's book
  })
})
