import { describe, it, expect } from 'vitest'
import { getBook } from './book-store.js'
import { getBookLedger } from './book-ledger.js'
import { getAuditLog } from './audit-store.js'
import { adjustFigure } from './manager-actions.js'

// Integration against the live singletons (memory-backed outside the browser).
describe('adjustFigure — manual figure adjustment, logged', () => {
  it('moves the figure and records an audited adjust entry', () => {
    const player = Object.values(getBook().members).find((m) => m.role === 'player')!
    const before = player.account.balance
    const pendBefore = player.account.pending

    const entry = adjustFigure(player.id, 5000, 'goodwill re-credit')

    expect(player.account.balance).toBe(before + 5000)
    expect(player.account.pending).toBe(pendBefore) // holds untouched
    // the durable ledger captured it with the audit trail
    expect(getBookLedger()[0]).toMatchObject({
      kind: 'adjust',
      accountId: player.id,
      balanceDelta: 5000,
      balanceAfter: before + 5000,
      actor: 'operator',
      reason: 'goodwill re-credit',
    })
    expect(entry.kind).toBe('adjust')
    // it also lands in the operator audit trail (who moved the figure + why)
    expect(getAuditLog()[0]).toMatchObject({ action: 'adjust', memberId: player.id, actor: 'operator' })
    expect(getAuditLog()[0].detail).toContain('goodwill re-credit')
  })

  it('debits too (negative delta), with the after-figure recorded', () => {
    const player = Object.values(getBook().members).find((m) => m.role === 'player')!
    const before = player.account.balance
    adjustFigure(player.id, -1500, 'correction')
    expect(player.account.balance).toBe(before - 1500)
    expect(getBookLedger()[0]).toMatchObject({ balanceDelta: -1500, reason: 'correction' })
  })

  it('requires a reason, a non-zero whole delta, and a real member', () => {
    const player = Object.values(getBook().members).find((m) => m.role === 'player')!
    expect(() => adjustFigure(player.id, 100, '   ')).toThrow(/reason/)
    expect(() => adjustFigure(player.id, 0, 'x')).toThrow(/non-zero/)
    expect(() => adjustFigure(player.id, 1.5, 'x')).toThrow(/whole number/)
    expect(() => adjustFigure('nobody', 100, 'x')).toThrow(/no member/)
  })
})
