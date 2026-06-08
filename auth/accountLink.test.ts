import { describe, it, expect } from 'vitest'
import { memberForUser } from './accountLink.js'

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
