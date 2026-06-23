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
import { __setEconomyMode } from './economy-mode.js'
import type { Account } from '../../core/index.js'
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
  __setEconomyMode(null) // restore the default credits mode
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

  it('an operator settles an in-flight challenge they are NOT party to — pot pays through core', () => {
    // a non-participant operator; the seed has a Lena (proposer) vs Priya in-flight match
    act(() =>
      root.render(
        <ChallengesSection viewerId="p-op" viewerName="Op" account={account} role="manager" />,
      ),
    )
    click(buttons().find((b) => b.textContent?.startsWith('Active'))!)
    const lena = accountBook.get('p-lena')!
    const priya = accountBook.get('p-priya')!
    const lb = lena.balance
    const pb = priya.balance
    const wonBtn = buttons().find((b) => b.textContent === 'Lena won')
    expect(wonBtn).toBeTruthy()
    click(wonBtn!)
    // pot pays the winner through core and nets zero
    expect(lena.balance).toBe(lb + 2_500)
    expect(priya.balance).toBe(pb - 2_500)
    expect(text()).toMatch(/Settled|takes/)
  })

  it('an operator who is a PARTICIPANT cannot grade their own challenge (no settle control)', () => {
    act(() =>
      root.render(
        <ChallengesSection viewerId="p-viewer" viewerName="You" account={account} role="manager" />,
      ),
    )
    // accept an open offer → the operator is now a participant in that in-flight challenge
    click(host.querySelector('.p2p-accept') as HTMLButtonElement)
    expect(account.pending).toBeGreaterThan(0)
    click(buttons().find((b) => b.textContent?.startsWith('Active'))!)
    // the card the operator is a party to ('(you)') shows NO settle control
    const ownCard = [...host.querySelectorAll('.p2p-card')].find((c) =>
      c.textContent?.includes('(you)'),
    )!
    expect(
      [...ownCard.querySelectorAll('button')].some((b) => b.textContent?.includes('won')),
    ).toBe(false)
  })

  it('a plain player sees no settle/void control on in-flight challenges (operator-only)', () => {
    render() // no role → plain player
    click(host.querySelector('.p2p-accept') as HTMLButtonElement)
    click(buttons().find((b) => b.textContent?.startsWith('Active'))!)
    expect(buttons().some((b) => b.textContent?.includes('won'))).toBe(false)
  })

  it('the stake surface is mode-aware — staking actions gate off when the mode disables them', () => {
    __setEconomyMode({
      id: 'spectator',
      label: 'Spectator',
      stakingEnabled: false,
      note: 'Staking is paused.',
    })
    render()
    // the "New challenge" CTA and every Accept are gated behind ModeGate, replaced by the note
    expect(buttons().some((b) => b.textContent === 'New challenge')).toBe(false)
    expect(host.querySelectorAll('.p2p-accept').length).toBe(0)
    expect(text()).toContain('Staking is paused')
  })

  it('staking actions are present in the default credits mode', () => {
    render()
    expect(buttons().some((b) => b.textContent === 'New challenge')).toBe(true)
    expect(host.querySelectorAll('.p2p-accept').length).toBeGreaterThan(0)
    expect(text()).toContain('Credits') // the mode chip
  })

  it('the friend picker lists players the viewer FOLLOWS (real social graph, org names)', () => {
    // render as a seeded social player (Marco follows Lena, Priya, Dana)
    const marco: Account = { id: 'p-marco', creditLimit: 200_000, balance: 0, pending: 0 }
    act(() =>
      root.render(<ChallengesSection viewerId="p-marco" viewerName="Marco" account={marco} />),
    )
    click(buttons().find((b) => b.textContent === 'New challenge')!)
    const select = host.querySelector('select')!
    const opts = [...select.querySelectorAll('option')].map((o) => o.textContent)
    expect(opts).toContain('Open to community')
    // names resolve from the ORG BOOK, not the p2p seed roster — p-dana is 'Dana (VIP)' in the
    // org (the seed roster says plain 'Dana'), which proves the picker reads the real source.
    expect(opts).toEqual(expect.arrayContaining(['Lena', 'Priya', 'Dana (VIP)']))
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
