// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ComponentType } from 'react'
import controlManifests from './manifest.js'
import {
  getSettings,
  setDefaultCreditLimit,
  setRiskCreditUtil,
  setRiskExposureCap,
  setSettlementPeriodDays,
} from '../../app/settings-store.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
  act(() => roots.forEach((r) => r.root.unmount()))
  roots.forEach((r) => r.host.remove())
  roots.length = 0
  // restore book settings (the settings panel test edits them)
  setSettlementPeriodDays(7)
  setDefaultCreditLimit(20_000)
  setRiskCreditUtil(0.8)
  setRiskExposureCap(null)
})

function mount(Panel: ComponentType<{ onBack: () => void }>, onBack: () => void = () => {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(<Panel onBack={onBack} />))
  roots.push({ root, host })
  return host
}
const byKey = (key: string) => controlManifests.find((m) => m.key === key)!

describe('control manifest', () => {
  it('declares the four tiles in order with the full contract shape', () => {
    expect(controlManifests.map((m) => m.key)).toEqual([
      'analytics',
      'access',
      'security',
      'settings',
    ])
    for (const m of controlManifests) {
      expect(m.section).toBe('control')
      expect(typeof m.name).toBe('string')
      expect(m.icon).toBeTruthy()
      expect(typeof m.Panel).toBe('function')
    }
  })

  it('every panel renders a themed body', () => {
    for (const m of controlManifests) {
      expect(mount(m.Panel).querySelector('.feat-panel'), m.key).toBeTruthy()
    }
  })

  it('analytics adapts the reporting page', () => {
    expect(mount(byKey('analytics').Panel).querySelector('.mgr-report-title')).toBeTruthy()
  })

  it('access shows MANAGER permissions (not agent tiers)', () => {
    const host = mount(byKey('access').Panel)
    expect(host.textContent).toContain('Permissions')
    // it's the capability grant UI, not the org agent/super-agent hierarchy
    expect(host.textContent).not.toMatch(/super-?agent hierarchy/i)
  })

  it('sessions shows the current session and flags the missing backend', () => {
    const host = mount(byKey('security').Panel)
    expect(host.textContent).toContain('Sessions')
    expect(host.textContent).toContain('Current session')
    expect(
      [...host.querySelectorAll('.feat-flag')].some((f) =>
        /needs backend/i.test(f.textContent ?? ''),
      ),
    ).toBe(true)
  })

  it('settings edits a real book setting through the store', () => {
    const host = mount(byKey('settings').Panel)
    const cadence = host.querySelectorAll<HTMLInputElement>('.feat-input')[0]
    expect(cadence).toBeTruthy()
    cadence.value = '10'
    act(() => cadence.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(getSettings().settlementPeriodDays).toBe(10)
  })

  it('Escape calls onBack', () => {
    let backs = 0
    mount(byKey('settings').Panel, () => (backs += 1))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(backs).toBe(1)
  })
})
