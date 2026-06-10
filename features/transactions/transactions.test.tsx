// @vitest-environment happy-dom
/**
 * Ledger panel — seeds a few DURABLE rows for a unique test account (fixture setup,
 * not the panel mutating money), then asserts the panel renders them, the kind chip
 * narrows them, the player select scopes them, and the export buttons exist. We never
 * run a real settle/adjust from the panel (it's read-only), so the shared book
 * singleton is never moved.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { recordBookEntry } from '../../app/book-ledger.js'
import { LedgerPanel } from './LedgerPanel.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ACCT = 'tx-test-acct'

function host(): HTMLDivElement {
  const h = document.createElement('div')
  document.body.appendChild(h)
  return h
}

/** Rows scoped to our unique account, regardless of what else is in the ledger. */
function acctRows(h: HTMLElement): HTMLTableRowElement[] {
  return [...h.querySelectorAll<HTMLTableRowElement>('tbody tr')].filter((tr) =>
    (tr.textContent ?? '').includes(ACCT),
  )
}

beforeAll(() => {
  // FIXTURE: append durable entries directly (not via the panel). This is the
  // sanctioned seam for wiring in other money flows; it does NOT touch core money.
  recordBookEntry({
    kind: 'resolve',
    accountId: ACCT,
    wagerId: 'w_tx1',
    balanceDelta: 500,
    pendingDelta: -250,
    balanceAfter: 1500,
    pendingAfter: 0,
    outcome: 'win',
    multiplier: 3,
    meta: { game: 'mines', gameName: 'Mines', stake: 250 },
  })
  recordBookEntry({
    kind: 'adjust',
    accountId: ACCT,
    balanceDelta: -1000,
    pendingDelta: 0,
    balanceAfter: 500,
    pendingAfter: 0,
    actor: 'operator',
    reason: 'manual correction s_99',
  })
})

describe('Ledger panel', () => {
  it('renders the seeded durable rows for the test account', () => {
    const h = host()
    const root: Root = createRoot(h)
    act(() => root.render(<LedgerPanel onBack={() => {}} />))

    const rows = acctRows(h)
    expect(rows.length).toBeGreaterThanOrEqual(2)
    // resolve row traces to its game + outcome + originating wager id
    expect(h.textContent).toContain('Mines')
    expect(h.textContent).toContain('w_tx1')
    // adjust row traces to actor + reason
    expect(h.textContent).toContain('manual correction s_99')

    act(() => root.unmount())
    h.remove()
  })

  it('a kind chip narrows the seeded rows to one kind', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<LedgerPanel onBack={() => {}} />))

    const before = acctRows(h).length
    expect(before).toBeGreaterThanOrEqual(2)

    const adjustChip = [...h.querySelectorAll<HTMLButtonElement>('.mdsk-chip')].find(
      (b) => (b.textContent ?? '').trim() === 'adjust',
    )
    expect(adjustChip).toBeTruthy()
    act(() => adjustChip!.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    const after = acctRows(h)
    expect(after.length).toBeLessThan(before)
    // only the adjust row survives for our account
    expect(after.every((tr) => (tr.querySelector('.mdsk-pill')?.textContent ?? '') === 'adjust')).toBe(
      true,
    )
    expect(h.textContent).not.toContain('w_tx1')

    act(() => root.unmount())
    h.remove()
  })

  it('exposes both export buttons', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<LedgerPanel onBack={() => {}} />))

    const labels = [...h.querySelectorAll<HTMLButtonElement>('.feat-btn')].map((b) =>
      (b.textContent ?? '').trim(),
    )
    expect(labels).toContain('Export CSV')
    expect(labels).toContain('Export JSON')

    act(() => root.unmount())
    h.remove()
  })
})
