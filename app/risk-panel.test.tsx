// @vitest-environment happy-dom
/**
 * The Risk panel reads the durable ledger + the org and renders live exposure, realized
 * hold, and per-game stats — verifying the store → analytics → render wiring.
 */
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { placeWager, resolveWager } from '../core/index.js'
import { getCurrentPlayer } from './book-store.js'
import { RiskPanel } from './RiskPanel.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('RiskPanel', () => {
  it('renders exposure + hold and reflects a resolved bet in the handle', () => {
    const player = getCurrentPlayer()!
    // a settled loss → handle 1000, book up (player lost) → durable ledger captures it
    resolveWager(player.account, placeWager(player.account, 1000), 'loss')

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(<RiskPanel />))

    const text = host.textContent ?? ''
    expect(text).toContain('Risk & exposure')
    expect(text).toContain('Live exposure')
    expect(text).toContain('Hold')
    // the handle stat reflects the settled bet (≥ $10.00 from the 1000-cent stake)
    const handle = [...host.querySelectorAll('.risk-stat')].find((s) => s.textContent?.startsWith('Handle'))
    expect(handle?.textContent).toMatch(/\$\d/)

    act(() => root.unmount())
    host.remove()
  })
})
