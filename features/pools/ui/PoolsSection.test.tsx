// @vitest-environment happy-dom
/** The player Pools surface renders, browses, and — when you join — holds the entry fee through
 *  core (account.pending moves). The operator panel renders its policy + pools oversight. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { getBook } from '../../../app/book-store.js'
import type { Account } from '../../../core/index.js'
import { PoolsSection } from './PoolsSection.js'
import { PoolsConsolePanel } from './PoolsConsolePanel.js'
import { __resetPools, createPool, getPools, type CreatePoolInput } from '../store.js'
import { __resetPoolsPolicy } from '../policy.js'
import { formatFor } from '../formats/index.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const NOW = Date.now
const DAY = 86_400_000
const acct = (id: string): Account => getBook().members[id]!.account
let host: HTMLElement
let root: Root

function publicPickem(over: Partial<CreatePoolInput> = {}): void {
  createPool({
    creatorId: 'mgr',
    creatorName: 'House',
    creatorIsOperator: true,
    name: 'Open Pick’em',
    kind: 'pickem',
    scope: 'event',
    privacy: 'public',
    entryCents: 500,
    maxEntries: null,
    minEntries: 1,
    guaranteedCents: 0,
    prizeStructure: [1],
    config: formatFor('pickem').defaultConfig(),
    lockAt: NOW() + DAY,
    now: NOW(),
    ...over,
  })
}

beforeEach(() => {
  __resetPools()
  __resetPoolsPolicy()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  __resetPools()
})

const text = () => host.textContent ?? ''
const buttons = () => [...host.querySelectorAll('button')]
const click = (el: Element) =>
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))

describe('PoolsSection', () => {
  const render = (account = acct('p-lena')) =>
    act(() => root.render(<PoolsSection viewerId="p-lena" viewerName="Lena" account={account} />))

  it('renders the surface with its tabs', () => {
    render()
    expect(host.querySelector('.pool-h1')?.textContent).toContain('Pools')
    expect(buttons().some((b) => b.textContent === 'Browse')).toBe(true)
    expect(buttons().some((b) => b.textContent === 'Create')).toBe(true)
  })

  it('lists a joinable pool and joining holds the entry fee through core', () => {
    publicPickem()
    const lena = acct('p-lena')
    const before = lena.pending
    render(lena)
    // open the pool card
    const card = host.querySelector('.pool-card') as HTMLButtonElement
    expect(card).toBeTruthy()
    click(card)
    // make a pick, then join
    const home = buttons().find((b) => b.textContent === 'Home')
    if (home) click(home)
    const join = buttons().find((b) => b.textContent?.startsWith('Join'))!
    click(join)
    expect(lena.pending).toBe(before + 500) // fee held through core
  })

  it('creates a pool through the wizard', () => {
    render()
    click(buttons().find((b) => b.textContent === 'Create')!)
    const nameInput = host.querySelector('input') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!
      setter.call(nameInput, 'My Bracket Pool')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click(buttons().find((b) => b.textContent === 'Create pool')!)
    expect(getPools().some((p) => p.name === 'My Bracket Pool')).toBe(true)
  })
})

describe('PoolsConsolePanel', () => {
  it('renders the operator policy + pools oversight', () => {
    publicPickem({ name: 'Console Pool' })
    act(() => root.render(<PoolsConsolePanel onBack={() => {}} />))
    expect(text()).toContain('Player pools policy')
    expect(text()).toContain('Allow players to create pools')
    expect(text()).toContain('Console Pool')
  })
})
