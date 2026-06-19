/**
 * The tenant economy config + the mid-season migration (app layer):
 *   - only the MANAGER can flip the mode (agents inherit it);
 *   - the credit→balance migration moves every credit through the audited book ledger, so the
 *     ledger fully accounts for the change (no direct balance writes, total conserved);
 *   - the audit envelope stamps the mode, so the trail stays interpretable across a flip;
 *   - guards: can't flip to the current mode, and a flip locks the mode briefly.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getBook } from './book-store.js'
import { getBookLedger } from './book-ledger.js'
import { getAuditLog } from './audit-store.js'
import { adjustFigure } from './manager-actions.js'
import { setViewer } from './viewer.js'
import { __resetEconomy, getEconomyMode } from '../core/index.js'
import {
  setEconomyMode,
  previewMigration,
  getEconomyConfig,
  updateEconomyConfig,
  __resetEconomyConfig,
} from './economy-config.js'

const T = 1_750_000_000_000
const bookTotal = (): number => Object.values(getBook().members).reduce((s, m) => s + m.account.balance, 0)

let snap: Record<string, { balance: number; pending: number; creditLimit: number }> = {}

beforeEach(() => {
  setViewer('mgr', 'manager')
  __resetEconomyConfig()
  __resetEconomy()
  const org = getBook()
  snap = {}
  for (const m of Object.values(org.members)) {
    snap[m.id] = { balance: m.account.balance, pending: m.account.pending, creditLimit: m.account.creditLimit }
  }
})

afterEach(() => {
  const org = getBook()
  for (const m of Object.values(org.members)) {
    const s = snap[m.id]
    if (s) {
      m.account.balance = s.balance
      m.account.pending = s.pending
      m.account.creditLimit = s.creditLimit
    }
  }
  setViewer('mgr', 'manager')
  __resetEconomyConfig()
  __resetEconomy()
})

describe('role gate', () => {
  it('an agent cannot change the economy mode', () => {
    setViewer('a-e', 'agent')
    expect(() => setEconomyMode('balance')).toThrow(/only the manager/)
    expect(getEconomyMode()).toBe('credit') // unchanged
  })

  it('the manager can flip it', () => {
    setEconomyMode('balance', { now: T })
    expect(getEconomyMode()).toBe('balance')
    expect(getEconomyConfig().economyMode).toBe('balance')
  })
})

describe('guards', () => {
  it('rejects flipping to the mode already in force', () => {
    expect(() => setEconomyMode('credit', { now: T })).toThrow(/already in credit/)
  })
  it('respects a configured flip cooldown', () => {
    updateEconomyConfig({ modeLockedUntil: T + 1_000 })
    expect(() => setEconomyMode('balance', { now: T })).toThrow(/locked/)
    expect(() => setEconomyMode('balance', { now: T + 2_000 })).not.toThrow() // past the lock
  })
  it('refuses a mid-bet flip while a wager is still open (interlock #8)', () => {
    // A flip closes figures to zero but leaves `pending`; a later resolve isn't floor-gated, so a
    // mid-bet flip could overdraw on settle. The flip must refuse while anything is pending.
    const someone = Object.values(getBook().members)[0]
    someone.account.pending = 5_000 // simulate an open wager's hold (afterEach restores it)
    expect(() => setEconomyMode('balance', { now: T })).toThrow(/still open/)
    expect(getEconomyMode()).toBe('credit') // unchanged — the flip was refused
  })
})

describe('previewMigration is read-only', () => {
  it('moves no money', () => {
    const before = bookTotal()
    previewMigration('balance', { kind: 'preserve' })
    expect(bookTotal()).toBe(before)
  })
})

describe('credit→balance migration conserves the ledger total', () => {
  it('records every credit move in the book ledger (no direct balance writes)', () => {
    const totalBefore = bookTotal()
    const lenBefore = getBookLedger().length

    const { report } = setEconomyMode('balance', { seed: { kind: 'preserve' }, now: T })

    const totalAfter = bookTotal()
    const grown = getBookLedger().length - lenBefore
    const newEntries = getBookLedger().slice(0, grown) // newest-first snapshot
    const recordedDelta = newEntries.reduce((s, e) => s + e.balanceDelta, 0)

    // The report's net equals the actual change in the book total…
    expect(report.ledgerDeltaCents).toBe(totalAfter - totalBefore)
    // …and the ledger entries fully account for that change — money moved only through core.
    expect(recordedDelta).toBe(totalAfter - totalBefore)
    // every migration ledger entry is stamped balance-mode (it ran under the new policy or the
    // close-out; the stamp is present either way)
    expect(newEntries.every((e) => e.economyMode === 'credit' || e.economyMode === 'balance')).toBe(true)
  })

  it('preserves non-negative figures and floors negatives at the balance floor', () => {
    const org = getBook()
    const before = new Map(Object.values(org.members).filter((m) => m.role === 'player').map((p) => [p.id, p.account.balance]))
    setEconomyMode('balance', { seed: { kind: 'preserve' }, now: T })
    for (const [id, b] of before) {
      expect(getBook().members[id].account.balance).toBe(Math.max(0, b))
    }
  })
})

describe('audit trail stays interpretable across a flip', () => {
  it('stamps the economy mode on every money event before and after', () => {
    adjustFigure('p-lena', 1_000, 'pre-flip credit move', 'operator')
    expect(getAuditLog()[0].economyMode).toBe('credit')

    setEconomyMode('balance', { now: T })
    expect(getAuditLog().some((e) => e.action === 'economy-mode')).toBe(true)

    adjustFigure('p-lena', 500, 'post-flip balance move', 'operator')
    expect(getAuditLog()[0].economyMode).toBe('balance')
  })
})
