// @vitest-environment happy-dom
/** Referral Program operator tile — manifest, manager-gated config, and the read-only activity
 *  table (no money moves here; rewards are issued by the store on qualification). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Member } from '../org/index.js'
import { getBook } from '../../app/book-store.js'
import { setViewer } from '../../app/viewer.js'
import {
  __resetReferrals,
  claimReferral,
  createCode,
  getReferralConfig,
  setReferralConfig,
} from './index.js'
import { referralManifests } from './manifest.js'
import { ReferralAdminPanel } from './ReferralAdminPanel.js'
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

const players = (): Member[] => Object.values(getBook().members).filter((m) => m.role === 'player')

describe('Referral Program — operator tile', () => {
  it('manifest targets the Rewards section', () => {
    const m = referralManifests[0]
    expect(m.key).toBe('referrals')
    expect(m.section).toBe('rewards')
    expect(m.Panel).toBe(ReferralAdminPanel)
  })

  it('renders config + the empty activity state', () => {
    act(() => root.render(<ReferralAdminPanel onBack={() => {}} />))
    expect(host.textContent).toMatch(/Referral program off/)
    expect(host.textContent).toMatch(/No referral activity yet/)
  })

  it('a manager can switch the program on', () => {
    act(() => root.render(<ReferralAdminPanel onBack={() => {}} />))
    const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    act(() => toggle.click()) // toggles checked + fires React onChange
    expect(getReferralConfig().enabled).toBe(true)
  })

  it('lists referral activity once an invite is claimed', () => {
    const [a, b] = players()
    setReferralConfig({ enabled: true, rewardCents: 5000 })
    const code = createCode(a.id).code!
    claimReferral(code, b.id)

    act(() => root.render(<ReferralAdminPanel onBack={() => {}} />))
    expect(host.textContent).toContain(a.name)
    expect(host.textContent).toContain(b.name)
    expect(host.textContent).toMatch(/Pending/)
  })

  it('a non-manager sees view-only config', () => {
    setViewer('a-e', 'agent')
    act(() => root.render(<ReferralAdminPanel onBack={() => {}} />))
    expect(host.textContent).toMatch(/Set by the manager/)
    const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(toggle.disabled).toBe(true)
  })
})
