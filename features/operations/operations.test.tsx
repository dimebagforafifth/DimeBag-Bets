// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ComponentType } from 'react'
import operationsManifests from './manifest.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
  act(() => roots.forEach((r) => r.root.unmount()))
  roots.forEach((r) => r.host.remove())
  roots.length = 0
})

function mount(Panel: ComponentType<{ onBack: () => void }>, onBack: () => void = () => {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(<Panel onBack={onBack} />))
  roots.push({ root, host })
  return host
}
const byKey = (key: string) => operationsManifests.find((m) => m.key === key)!

describe('operations manifest', () => {
  it('declares its tiles in order with the full contract shape', () => {
    expect(operationsManifests.map((m) => m.key)).toEqual([
      'weekly-figures',
      'pending',
      'live-activity',
      'settlements',
      'transactions',
      'risk',
      'alerts',
      'settle',
    ])
    for (const m of operationsManifests) {
      expect(m.section).toBe('operations')
      expect(typeof m.name).toBe('string')
      expect(m.name.length).toBeGreaterThan(0)
      expect(typeof m.hint).toBe('string')
      expect(m.icon).toBeTruthy() // a lucide component
      expect(typeof m.Panel).toBe('function')
    }
  })

  it('every panel renders a themed (charcoal/gold) body, no top bar', () => {
    for (const m of operationsManifests) {
      const host = mount(m.Panel)
      expect(host.querySelector('.feat-panel'), m.key).toBeTruthy()
    }
  })

  // Panels render body content only — no tile-name title (the shell shows that).
  it('the NEW panels render their own real content', () => {
    expect(mount(byKey('weekly-figures').Panel).textContent).toContain('Book figure')
    expect(mount(byKey('pending').Panel).textContent).toContain('Total at risk')
  })

  it('the adapters surface the existing components', () => {
    expect(mount(byKey('settlements').Panel).textContent).toContain('Settlement history')
    expect(mount(byKey('transactions').Panel).textContent).toContain('Net figure')
    expect(mount(byKey('live-activity').Panel).textContent).toContain('No betting activity')
  })

  it('Escape calls onBack (the shell-provided back affordance)', () => {
    let backs = 0
    mount(byKey('weekly-figures').Panel, () => (backs += 1))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(backs).toBe(1)
  })

  // Last — it squares up the demo book (resets figures), so keep it after the others.
  it('the Settle action squares up the book through settleAndRecord', () => {
    const host = mount(byKey('settle').Panel)
    const clickBtn = (re: RegExp) =>
      act(() =>
        [...host.querySelectorAll<HTMLButtonElement>('button')]
          .find((b) => re.test(b.textContent ?? ''))!
          .click(),
      )
    clickBtn(/Settle period/) // → confirm step
    expect(host.textContent).toMatch(/Confirm\?/)
    clickBtn(/Yes, settle now/) // → runs settleAndRecord
    expect(host.textContent).toMatch(/Settled \d+ account/)
  })
})
