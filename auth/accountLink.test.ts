import { describe, it, expect } from 'vitest'
import { memberForUser, accountForUser, accountIdForUser } from './accountLink.js'
import { getBook } from '../app/book-store.js'

describe('memberForUser', () => {
  it('maps a seeded user id onto its book member (account/org node)', () => {
    expect(memberForUser('mgr')?.role).toBe('manager')
    expect(memberForUser('p-marco')?.role).toBe('player')
    expect(memberForUser('p-marco')?.account).toBeTruthy()
  })

  it('returns null for an unknown or empty user (unlinked → treated as no account)', () => {
    expect(memberForUser('nobody')).toBeNull()
    expect(memberForUser(null)).toBeNull()
    expect(memberForUser(undefined)).toBeNull()
  })
})

describe('accounts selector (the real account-link seam)', () => {
  it('accountIdForUser resolves the linked account id, or null when unlinked', () => {
    expect(accountIdForUser('p-marco')).toBe('p-marco')
    expect(accountIdForUser('nobody')).toBeNull()
    expect(accountIdForUser(null)).toBeNull()
  })

  it('accountForUser returns the linked core Account — the live figure', () => {
    expect(accountForUser('p-marco')).toBe(getBook().members['p-marco'].account)
    expect(accountForUser('nobody')).toBeNull()
  })

  it('memberForUser is resolved THROUGH the accounts selector', () => {
    // same contract as before, now routed via accountIdForUser
    expect(memberForUser('mgr')).toBe(getBook().members['mgr'])
  })
})
