// @vitest-environment happy-dom
/** The Challenges section renders a populated surface (open offers, in-flight, history) and
 *  accepting an open challenge escrows the viewer's stake through core — the figure really
 *  moves, and the pot stays zero-sum. Credits only. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChallengesSection } from './index.js'
import { __resetChallenges } from './seed.js'
import { accountBook } from './store.js'
import type { Account } from '../core/index.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
let account: Account

beforeEach(() => {
  __resetChallenges()
  account = { id: 'p-viewer', creditLimit: 100_000, balance: 0, pending: 0 }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (onBalanceChange?: () => void) =>
  act(() =>
    root.render(
      <ChallengesSection
        viewerId="p-viewer"
        viewerName="You"
        account={account}
        onBalanceChange={onBalanceChange}
      />,
    ),
  )
const text = () => host.textContent ?? ''
const buttons = () => [...host.querySelectorAll('button')]
const click = (el: Element) =>
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))

describe('ChallengesSection', () => {
  it('renders the no-vig surface with open offers', () => {
    render()
    expect(host.querySelector('.p2p-h1')?.textContent).toBe('Challenges')
    expect(text()).toContain('no house cut')
    // seeded open community offers are acceptable by the viewer
    expect(host.querySelectorAll('.p2p-accept').length).toBeGreaterThan(0)
  })

  it('shows in-flight and settled challenges in their tabs', () => {
    render()
    const activeTab = buttons().find((b) => b.textContent?.startsWith('Active'))!
    click(activeTab)
    expect(text()).toContain('awaiting result')

    const historyTab = buttons().find((b) => b.textContent === 'History')!
    click(historyTab)
    expect(text()).toMatch(/won|refunded/)
  })

  it('accepting an open challenge escrows the viewer’s stake through core', () => {
    let refreshed = 0
    render(() => (refreshed += 1))
    const acceptBtn = host.querySelector('.p2p-accept') as HTMLButtonElement
    expect(acceptBtn).toBeTruthy()
    click(acceptBtn)
    // the viewer's real account now holds a stake in pending — money moved via core
    expect(account.pending).toBeGreaterThan(0)
    expect(refreshed).toBeGreaterThan(0)
  })

  it('the pot stays zero-sum after the viewer accepts (house nets zero)', () => {
    render()
    const acceptBtn = host.querySelector('.p2p-accept') as HTMLButtonElement
    click(acceptBtn)
    // both parties' balances are still 0 (stakes only held, not yet won/lost)
    expect(account.balance).toBe(0)
    const totalBalances = [
      ...['p-marco', 'p-lena', 'p-priya', 'p-dana', 'p-tariq', 'p-viewer'],
    ].reduce((sum, id) => sum + (accountBook.get(id)?.balance ?? 0), 0)
    expect(totalBalances).toBe(0)
  })

  it('opens the propose form and posts an open challenge holding no money', () => {
    render()
    const newBtn = buttons().find((b) => b.textContent === 'New challenge')!
    click(newBtn)
    const set = (label: string, value: string) => {
      const input = [...host.querySelectorAll('label')]
        .find((l) => l.textContent?.includes(label))
        ?.querySelector('input')
      if (input) {
        act(() => {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
          )!.set!
          setter.call(input, value)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })
      }
    }
    set('Matchup', 'My game tonight')
    set('Your pick', 'Over')
    set('Their pick', 'Under')
    const postBtn = buttons().find((b) => b.textContent === 'Post challenge')!
    click(postBtn)
    expect(text()).toContain('Challenge posted')
    // proposing holds nothing
    expect(account.pending).toBe(0)
  })
})
