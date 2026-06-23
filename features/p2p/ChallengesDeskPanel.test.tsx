// @vitest-environment happy-dom
/** The operator Challenges Desk lists accepted (in-flight) challenges and grades them through
 *  core: settling pays the pot to the winner (nets zero) and voiding refunds both. Operator-
 *  only by virtue of the console; players never reach it. Credits only. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChallengesDeskPanel } from './ChallengesDeskPanel.js'
import { challenges, accountBook } from './store.js'
import { seedChallenges, __resetChallenges } from './seed.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const NOW = 1_750_000_000_000
let host: HTMLElement
let root: Root

beforeEach(() => {
  __resetChallenges()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = () => act(() => root.render(<ChallengesDeskPanel onBack={() => {}} />))
const buttons = () => [...host.querySelectorAll('button')]
const click = (el: Element) =>
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))

describe('ChallengesDeskPanel (operator)', () => {
  it('settles an in-flight challenge to the winner — pot pays through core, nets zero', () => {
    seedChallenges(NOW)
    render()
    const inflight = challenges.all().find((c) => c.status === 'accepted')!
    expect(inflight.proposer.playerName).toBe('Lena') // seed: Lena (proposer) vs Priya (accepter)
    const lena = accountBook.get('p-lena')!
    const priya = accountBook.get('p-priya')!
    const lb = lena.balance
    const pb = priya.balance
    const loserStake = inflight.accepterStakeCents

    click(buttons().find((b) => b.textContent === 'Lena won')!)

    expect(challenges.get(inflight.id)!.status).toBe('settled')
    expect(lena.balance).toBe(lb + loserStake) // proposer wins exactly the accepter's stake
    expect(priya.balance).toBe(pb - loserStake)
    expect(lena.pending).toBe(0)
    expect(priya.pending).toBe(0)
  })

  it('voids an in-flight challenge — both stakes refunded through core', () => {
    seedChallenges(NOW)
    render()
    const inflight = challenges.all().find((c) => c.status === 'accepted')!
    const lena = accountBook.get('p-lena')!
    const priya = accountBook.get('p-priya')!
    const lb = lena.balance
    const pb = priya.balance

    click(buttons().find((b) => b.textContent === 'Void')!)

    expect(challenges.get(inflight.id)!.status).toBe('voided')
    expect(lena.balance).toBe(lb) // refund: balances unchanged, holds released
    expect(priya.balance).toBe(pb)
    expect(lena.pending).toBe(0)
    expect(priya.pending).toBe(0)
  })

  it('shows nothing in flight on an empty book', () => {
    render()
    expect(host.textContent).toContain('No accepted challenges')
  })
})
