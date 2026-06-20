// @vitest-environment happy-dom
/** Invite Friends player section — off-by-default copy, minting an invite code, and redeeming
 *  a code (claim flows through the store; no money moves in this surface). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { setViewer } from '../../app/viewer.js'
import { __resetReferrals, createCode, refereeReferral, setReferralConfig } from '../index.js'
import { ReferralSection, referralsSection } from './ReferralSection.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  __resetReferrals()
  setViewer('mgr', 'manager')
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  __resetReferrals()
})

const btn = (text: string): HTMLButtonElement =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    (b.textContent ?? '').includes(text),
  )!
function setValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  act(() => el.dispatchEvent(new Event('input', { bubbles: true })))
}

describe('ReferralSection', () => {
  it('descriptor targets the player section', () => {
    expect(referralsSection).toMatchObject({ id: 'referrals', roles: ['player'] })
  })

  it('off-by-default: shows the no-program message', () => {
    act(() => root.render(<ReferralSection playerId="p1" playerName="Pat" />))
    expect(host.textContent).toMatch(/No referral program is running/)
  })

  it('with a program on, mints and shows an invite code', () => {
    setReferralConfig({ enabled: true, rewardCents: 5000 })
    act(() => root.render(<ReferralSection playerId="p1" playerName="Pat" />))
    expect(host.textContent).toMatch(/Invite a friend/)
    act(() => btn('Create my invite code').click())
    expect(host.querySelector('.ref-code')?.textContent).toBe('INV-0001')
    expect(host.textContent).toMatch(/both/) // "you both get $50.00"
  })

  it('redeeming a friend’s code claims it through the store', () => {
    setReferralConfig({ enabled: true, rewardCents: 5000 })
    const code = createCode('r1').code! // a different player's invite
    act(() => root.render(<ReferralSection playerId="p2" playerName="Sam" />))
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Invite code"]')!
    setValue(input, code)
    act(() => btn('Redeem').click())
    expect(refereeReferral('p2')?.referrerId).toBe('r1') // claimed
    expect(host.textContent).toMatch(/place a bet to unlock/)
  })
})
