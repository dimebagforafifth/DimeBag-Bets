// @vitest-environment happy-dom
/**
 * End-to-end through the REAL UI: one player proposes in the section, a second accepts (both
 * stakes escrow through core), then the OPERATOR grades it on the desk. Settle nets exactly
 * zero (house takes nothing); void refunds both. This is the click-through the lane requires,
 * driven entirely through the components + the shared core. Credits only.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChallengesSection } from './ChallengesSection.js'
import { ChallengesDeskPanel } from './ChallengesDeskPanel.js'
import { challenges, accountBook, registerAccount } from './store.js'
import { __resetChallenges } from './seed.js'
import type { Account } from '../../core/index.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
let alice: Account
let bob: Account

beforeEach(() => {
  __resetChallenges()
  alice = { id: 'p-alice', creditLimit: 100_000, balance: 0, pending: 0 }
  bob = { id: 'p-bob', creditLimit: 100_000, balance: 0, pending: 0 }
  registerAccount('p-alice', alice)
  registerAccount('p-bob', bob)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const TITLE = 'Heads-up tonight'
const buttons = () => [...host.querySelectorAll('button')]
const click = (el: Element) =>
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
/** A button (by exact label) inside the element whose text contains `title` — the section auto-
 *  seeds the demo, so we always target Alice & Bob's own matchup, never a seeded one. */
const clickIn = (selector: string, title: string, label: string) => {
  const row = [...host.querySelectorAll(selector)].find((r) => r.textContent?.includes(title))
  if (!row) throw new Error(`no ${selector} for "${title}"`)
  const btn = [...row.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
  if (!btn) throw new Error(`no "${label}" button in "${title}"`)
  click(btn)
}
const setField = (label: string, value: string) => {
  const input = [...host.querySelectorAll('label')]
    .find((l) => l.textContent?.includes(label))
    ?.querySelector('input')
  if (!input) throw new Error(`no field ${label}`)
  act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      value,
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Alice proposes an even-money open challenge for $20 through the section UI. */
function aliceProposes(): void {
  act(() =>
    root.render(<ChallengesSection viewerId="p-alice" viewerName="Alice" account={alice} />),
  )
  click(buttons().find((b) => b.textContent === 'New challenge')!)
  setField('Matchup', TITLE)
  setField('Your pick', 'Heads')
  setField('Their pick', 'Tails')
  setField('Your stake', '20')
  click(buttons().find((b) => b.textContent === 'Post challenge')!)
}

/** Bob accepts Alice's open challenge through the section UI (escrows both stakes via core). */
function bobAccepts(): void {
  act(() => root.render(<ChallengesSection viewerId="p-bob" viewerName="Bob" account={bob} />))
  const card = [...host.querySelectorAll('.p2p-card')].find((c) => c.textContent?.includes(TITLE))
  if (!card) throw new Error('Alice’s challenge not visible to Bob')
  click(card.querySelector('.p2p-accept') as HTMLButtonElement)
}

describe('propose → accept → operator settle/void (end-to-end)', () => {
  it('settle pays the pot to the winner and nets exactly zero (house takes nothing)', () => {
    aliceProposes()
    expect(alice.pending).toBe(0) // proposing holds nothing
    bobAccepts()
    // both stakes ($20 each, even money) escrowed through core
    expect(alice.pending).toBe(2_000)
    expect(bob.pending).toBe(2_000)
    expect(alice.balance).toBe(0)
    expect(bob.balance).toBe(0)

    // operator grades it on the desk → Alice (proposer) won
    act(() => root.render(<ChallengesDeskPanel onBack={() => {}} />))
    clickIn('.cdsk-row', TITLE, 'Alice won')

    expect(alice.balance).toBe(2_000) // winner profit = loser's stake
    expect(bob.balance).toBe(-2_000)
    expect(alice.pending).toBe(0)
    expect(bob.pending).toBe(0)
    expect(alice.balance + bob.balance).toBe(0) // zero-sum: the house nets nothing
  })

  it('void refunds both stakes (every figure back to zero)', () => {
    aliceProposes()
    bobAccepts()
    expect(alice.pending + bob.pending).toBe(4_000)

    act(() => root.render(<ChallengesDeskPanel onBack={() => {}} />))
    clickIn('.cdsk-row', TITLE, 'Void')

    expect(alice.balance).toBe(0)
    expect(bob.balance).toBe(0)
    expect(alice.pending).toBe(0)
    expect(bob.pending).toBe(0)
    expect(challenges.all().find((c) => c.title === TITLE)!.status).toBe('voided')
    // both accounts exist in the book and net zero — no credits created or destroyed
    expect(
      (accountBook.get('p-alice')?.balance ?? 0) + (accountBook.get('p-bob')?.balance ?? 0),
    ).toBe(0)
  })
})
