// @vitest-environment happy-dom
/**
 * The real app mounts <App/> inside <StrictMode> (app/main.tsx), which double-
 * invokes renders and runs effects mount→unmount→mount in dev. This guards that
 * the reported flow works under that shell: drop Plinko balls, then click OUTSIDE
 * Plinko before they land — the top-right Figure must keep matching the true
 * balance. (Asserting figure === balance is push-safe: a 1× slot leaves the
 * balance unchanged, which is correct, not a forfeit.)
 */

import { describe, expect, it } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { availableToWager } from '../core/index.js'
import { App } from './App.js'
import { getCurrentPlayer } from './book-store.js'
import { formatMoney } from '../games/shared/money.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function figure(host: HTMLElement): string {
  // The header wallet is the brand WalletPill; its first value is the headline balance.
  return host.querySelector('.sds-wallet__value')?.textContent ?? ''
}
function click(host: HTMLElement, selector: string, text: RegExp): boolean {
  const el = [...host.querySelectorAll<HTMLElement>(selector)].find((n) =>
    text.test(n.textContent ?? ''),
  )
  if (!el) return false
  act(() => el.click())
  return true
}

describe('Plinko under StrictMode (matches the real app shell)', () => {
  it('the Figure matches the true balance in-game and after clicking outside Plinko', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() =>
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      ),
    )

    const acct = getCurrentPlayer()!.account
    expect(click(host, 'button.sds-gamecard', /plinko/i)).toBe(true)
    // The game view is a lazy() chunk: await its dynamic import (the same module
    // promise React.lazy is suspended on) so Plinko mounts (under StrictMode's
    // mount→unmount→mount) before we drive its Play button.
    await act(async () => {
      await import('../games/plinko/ui/PlinkoGame.js')
    })

    // Drop several balls; the headline Balance (availableToWager) must track the
    // real balance after each (a drop settles immediately, so pending stays 0).
    for (let i = 0; i < 5; i++) {
      expect(click(host, 'button.action', /^play$/i)).toBe(true)
      expect(figure(host)).toBe(formatMoney(availableToWager(acct)))
    }
    const balanceInGame = acct.balance

    // Click OUTSIDE Plinko (a sidebar nav item) — mid-fall, no ball has "landed".
    expect(click(host, 'button.psa-nav-item', /my bets/i)).toBe(true)

    // The balance change is not lost: still the true balance, still shown.
    expect(acct.balance).toBe(balanceInGame)
    expect(figure(host)).toBe(formatMoney(availableToWager(acct)))

    act(() => root.unmount())
    host.remove()
  })
})
