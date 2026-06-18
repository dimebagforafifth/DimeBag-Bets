// @vitest-environment happy-dom
/**
 * Economy Mode UI: the manager sees the switch + settings; an agent sees it read-only; and the
 * <ModeGate> seam renders only the children for the active mode. No money moves here (the flip
 * itself is covered by app/economy-config.test.ts), so the shared book is left untouched.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { setViewer } from '../../app/viewer.js'
import { __resetEconomyConfig } from '../../app/economy-config.js'
import { __resetEconomy } from '../../core/index.js'
import { ModeGate } from '../../app/economy-mode.js'
import { EconomyModePanel } from './EconomyModePanel.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function host(): HTMLDivElement {
  const h = document.createElement('div')
  document.body.appendChild(h)
  return h
}

let root: Root | null = null
function render(node: React.ReactNode): HTMLDivElement {
  const h = host()
  root = createRoot(h)
  act(() => root!.render(node))
  return h
}

beforeEach(() => {
  __resetEconomyConfig()
  __resetEconomy()
  setViewer('mgr', 'manager')
})
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  __resetEconomyConfig()
  __resetEconomy()
  setViewer('mgr', 'manager')
})

describe('ModeGate', () => {
  it('renders only the children for the active mode (credit by default)', () => {
    const h = render(
      <>
        <ModeGate mode="credit"><span>CREDIT-ONLY</span></ModeGate>
        <ModeGate mode="balance"><span>BALANCE-ONLY</span></ModeGate>
      </>,
    )
    expect(h.textContent).toContain('CREDIT-ONLY')
    expect(h.textContent).not.toContain('BALANCE-ONLY')
  })
})

describe('EconomyModePanel', () => {
  it('a manager sees both modes + the switch CTA + settings', () => {
    const h = render(<EconomyModePanel onBack={() => {}} />)
    expect(h.textContent).toContain('Credit (PPH)')
    expect(h.textContent).toContain('Balance (wallet)')
    expect(h.textContent).toContain('Switch to Balance') // the flip CTA
    expect(h.textContent).toContain('Settings')
  })

  it('an agent sees the mode read-only — no switch CTA', () => {
    setViewer('a-e', 'agent')
    const h = render(<EconomyModePanel onBack={() => {}} />)
    expect(h.textContent).toContain('set by the manager')
    expect(h.textContent).not.toContain('Switch to Balance')
  })
})
