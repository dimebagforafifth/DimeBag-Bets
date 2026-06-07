// @vitest-environment happy-dom
/**
 * Integration smoke test: the Promotions page renders, drafts a bonus against the
 * live book, and SENDING it credits players through core.grant + logs a campaign.
 * The planning/credit math is unit-tested in promotions.test.ts / promo-store.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PromotionsPage } from './PromotionsPage.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('PromotionsPage (smoke)', () => {
  let host: HTMLElement
  let root: ReturnType<typeof createRoot>
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('renders the sender, previews a plan, and logs a sent bonus', () => {
    act(() => root.render(<PromotionsPage />))

    expect(host.querySelector('.mgr-promo-title')?.textContent).toMatch(/Promotions/i)
    // The target dropdown is populated from the live book (demo org seeds members).
    expect(host.querySelectorAll('.mgr-select option').length).toBeGreaterThan(1)
    // A live plan preview is shown for the default (whole-book) target.
    expect(host.querySelector('.mgr-plan')?.textContent ?? '').toMatch(/player/i)

    // Send the bonus → a result line + a campaign row appear.
    const send = [...host.querySelectorAll('button')].find((b) => /Send bonus/i.test(b.textContent ?? ''))
    expect(send).toBeTruthy()
    act(() => send!.click())

    expect(host.querySelector('.mgr-result.is-ok')?.textContent ?? '').toMatch(/Sent .* to \d+ player/i)
    expect(host.querySelectorAll('.mgr-table tbody tr').length).toBeGreaterThanOrEqual(1)
  })
})
