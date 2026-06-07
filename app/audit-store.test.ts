import { describe, it, expect } from 'vitest'
import {
  addPlayer,
  removeMember,
  renameMember,
  reassign,
  setActive,
  setBookBettingLocked,
  setCreditLimit,
  setMaxWager,
} from '../org/index.js'
import { getBook } from './book-store.js'
import { auditedMutate } from './manager-actions.js'
import { getAuditLog, recordAudit } from './audit-store.js'

function aPlayer(activeOnly = false) {
  return Object.values(getBook().members).find((m) => m.role === 'player' && (!activeOnly || m.active))!
}

describe('audit store', () => {
  it('records, stamps an id, and returns newest-first', () => {
    const before = getAuditLog().length
    const e = recordAudit({ actor: 'operator', action: 'test', memberId: 'x', memberName: 'X', detail: 'hi', at: 1 })
    expect(e.id).toBeGreaterThan(0)
    expect(getAuditLog().length).toBe(before + 1)
    expect(getAuditLog()[0]).toMatchObject({ action: 'test', memberName: 'X', detail: 'hi' })
  })
})

describe('auditedMutate — diffs the book into audit entries', () => {
  it('logs a credit-limit change with old→new', () => {
    const p = aPlayer()
    const next = p.account.creditLimit + 1000
    auditedMutate((o) => setCreditLimit(o, p.id, next))
    expect(getAuditLog()[0]).toMatchObject({ action: 'credit', memberId: p.id, actor: 'operator' })
    expect(getAuditLog()[0].detail).toContain('→')
  })

  it('logs a suspend as an active change', () => {
    const p = aPlayer(true)
    auditedMutate((o) => setActive(o, p.id, false))
    expect(getAuditLog()[0]).toMatchObject({ action: 'active', memberId: p.id, detail: 'Suspended' })
  })

  it('records NOTHING when the mutation throws', () => {
    const p = aPlayer()
    const before = getAuditLog().length
    expect(() => auditedMutate((o) => setCreditLimit(o, p.id, -5))).toThrow()
    expect(getAuditLog().length).toBe(before)
  })

  it('collapses a same-direction bulk change (book-wide freeze) into a single entry', () => {
    auditedMutate((o) => setBookBettingLocked(o, getBook().managerId, true))
    expect(getAuditLog()[0]).toMatchObject({ action: 'bulk' })
    expect(getAuditLog()[0].detail).toMatch(/Locked betting — \d+ members/)
  })

  it('covers the rename / maxbet / move / add / remove branches with old→new detail', () => {
    const p = aPlayer()

    auditedMutate((o) => renameMember(o, p.id, 'Renamed One'))
    expect(getAuditLog()[0]).toMatchObject({ action: 'rename' })
    expect(getAuditLog()[0].detail).toContain('→ “Renamed One”')

    auditedMutate((o) => setMaxWager(o, p.id, 5000))
    expect(getAuditLog()[0]).toMatchObject({ action: 'maxbet' })
    expect(getAuditLog()[0].detail).toContain('∞ →') // unset → a cap

    // move a player straight under the manager (always a valid higher tier with headroom)
    const before = getBook().members[p.id].parentId
    if (before !== getBook().managerId) {
      auditedMutate((o) => reassign(o, p.id, getBook().managerId))
      expect(getAuditLog()[0]).toMatchObject({ action: 'move' })
      expect(getAuditLog()[0].detail).toContain('→') // from → to
    }

    auditedMutate((o) => addPlayer(o, getBook().managerId, { name: 'Temp', id: 'tmp-audit', creditLimit: 0 }))
    expect(getAuditLog()[0]).toMatchObject({ action: 'add', memberId: 'tmp-audit' })

    auditedMutate((o) => removeMember(o, 'tmp-audit')) // balance 0, no downline → removable
    expect(getAuditLog()[0]).toMatchObject({ action: 'remove', memberId: 'tmp-audit' })
  })
})
