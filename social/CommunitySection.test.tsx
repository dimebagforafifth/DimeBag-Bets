// @vitest-environment happy-dom
/** The Community section renders a populated feed, follows/unfollows, and tails/fades a
 *  friend's slip into a REAL core-routed bet (the player's figure moves). Credits only. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CommunitySection } from './index.js'
import { __resetSocial } from './seed.js'
import { __resetBets, getBets } from '../app/book/bets-store.js'
import { __resetPlacement } from '../app/book/placement.js'
import type { Account } from '../core/index.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
let account: Account

beforeEach(() => {
  __resetSocial()
  __resetBets()
  __resetPlacement()
  account = { id: 'p-marco', creditLimit: 100_000, balance: 0, pending: 0 }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = () =>
  act(() => root.render(<CommunitySection viewerId="p-marco" viewerName="Marco" account={account} />))
const text = () => host.textContent ?? ''
const cardFor = (name: string) => host.querySelector(`[aria-label="slip by ${name}"]`)!
const btn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))

describe('CommunitySection', () => {
  it('renders a populated feed of followed players’ slips', () => {
    render()
    expect(host.querySelector('.sc-h1')?.textContent).toBe('Community')
    // marco follows lena/priya/dana → their shared slips appear (tariq, unfollowed, does not)
    expect(cardFor('Lena')).toBeTruthy()
    expect(cardFor('Priya')).toBeTruthy()
    expect(cardFor('Dana')).toBeTruthy()
    expect(cardFor('Tariq')).toBeNull()
    expect(text()).not.toMatch(/coin/i) // credits only
  })

  it('tails a friend’s slip → a REAL core-routed bet (the figure moves)', () => {
    render()
    expect(account.pending).toBe(0)
    click(btn(cardFor('Lena'), 'Tail'))
    expect(account.pending).toBe(5_000) // stake held in core
    const placed = getBets()
    expect(placed.some((b) => b.accountId === 'p-marco')).toBe(true)
    expect(text()).toMatch(/Tailed Lena/)
  })

  it('fades a single slip → the OPPOSITE selection, through core', () => {
    render()
    // Priya's slip is a single (Chiefs spread) → fadeable
    click(btn(cardFor('Priya'), 'Fade'))
    expect(account.pending).toBeGreaterThan(0)
    const mine = getBets().filter((b) => b.accountId === 'p-marco')
    expect(mine).toHaveLength(1)
    expect(mine[0].legs[0].side).toBe('away') // opposite of Priya's home spread
    expect(text()).toMatch(/Faded Priya/)
  })

  it('lets a player follow others from the Friends tab', () => {
    render()
    click(btn(host, 'Friends')) // switch tab
    // Tariq isn't followed yet → a Follow button exists; clicking it follows
    const tariq = [...host.querySelectorAll('.sc-person')].find((p) => p.textContent?.includes('Tariq'))!
    expect(btn(tariq, 'Follow')).toBeTruthy()
    click(btn(tariq, 'Follow'))
    const tariq2 = [...host.querySelectorAll('.sc-person')].find((p) => p.textContent?.includes('Tariq'))!
    expect(btn(tariq2, 'Following')).toBeTruthy()
  })

  it('toggles privacy on the viewer’s own slip (owner-only control)', () => {
    render()
    const own = cardFor('Marco')
    const toggle = btn(own, '🔓 Shared')
    expect(toggle).toBeTruthy() // own card shows a privacy toggle, not Tail/Fade
    expect(btn(own, 'Tail')).toBeUndefined()
    click(toggle)
    expect(btn(cardFor('Marco'), '🔒 Private')).toBeTruthy()
  })
})
