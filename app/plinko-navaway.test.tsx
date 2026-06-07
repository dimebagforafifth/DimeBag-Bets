// @vitest-environment happy-dom
/**
 * "It works in the game, but when I click OUTSIDE Plinko the balance changes
 * don't register." This drives the real <App/> through EVERY way of leaving the
 * Plinko view — the ← Casino crumb, and each top nav tab (Casino, Sportsbook, My
 * Bets, Leaderboard, Management) — checking the top-right Figure after each, and
 * also that the change was persisted to storage (so a reload wouldn't revert it).
 */

import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { availableToWager } from '../core/index.js'
import { App } from './App.js'
import { getCurrentPlayer } from './book-store.js'
import { formatMoney } from '../games/shared/money.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function figure(host: HTMLElement): string {
  return host.querySelector('.figure-value')?.textContent ?? ''
}
function click(host: HTMLElement, selector: string, text: RegExp): boolean {
  const el = [...host.querySelectorAll<HTMLElement>(selector)].find((n) => text.test(n.textContent ?? ''))
  if (!el) return false
  act(() => el.click())
  return true
}
function openPlinkoAndDrop(host: HTMLElement): void {
  // From wherever we are, get to the casino lobby, open Plinko, drop a ball.
  click(host, 'button.nav-tab', /^casino$/i)
  if (!click(host, 'button.game-card', /plinko/i)) throw new Error('no Plinko card')
  if (!click(host, 'button.action', /^play$/i)) throw new Error('no Play button')
}

describe('leaving Plinko by any route keeps the balance change', () => {
  it('every nav route shows the post-drop figure, and the change is persisted', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    act(() => root.render(<App />))

    const acct = getCurrentPlayer()!.account

    // Each row: leave Plinko via this route, then assert the figure still reflects
    // the freshly dropped bet and the underlying balance didn't revert.
    const routes: Array<{ name: string; go: () => void }> = [
      { name: '← Casino crumb', go: () => void click(host, 'button.crumb', /casino/i) },
      { name: 'My Bets tab', go: () => void click(host, 'button.nav-tab', /my bets/i) },
      { name: 'Sportsbook tab', go: () => void click(host, 'button.nav-tab', /sportsbook/i) },
      { name: 'Leaderboard tab', go: () => void click(host, 'button.nav-tab', /leaderboard/i) },
      { name: 'Management tab', go: () => void click(host, 'button.nav-tab', /management/i) },
      { name: 'Casino tab', go: () => void click(host, 'button.nav-tab', /^casino$/i) },
    ]

    for (const route of routes) {
      openPlinkoAndDrop(host)
      const balanceAfterDrop = acct.balance
      // The header now leads with Balance (what you can bet = availableToWager),
      // which moves with the figure since a Plinko drop settles immediately
      // (pending stays 0). Sanity: it already shows the new balance in-game.
      expect(figure(host), `in-game Balance before leaving via ${route.name}`).toBe(
        formatMoney(availableToWager(acct)),
      )

      route.go() // click outside Plinko

      // The change must still be reflected after leaving this way.
      expect(acct.balance, `balance reverted after ${route.name}`).toBe(balanceAfterDrop)
      expect(figure(host), `Balance after leaving via ${route.name}`).toBe(
        formatMoney(availableToWager(acct)),
      )

      // And it must be PERSISTED — a reload reads this back, so it can't "un-register".
      const saved = JSON.parse(localStorage.getItem('dimebag:book.org') ?? '{}')
      const savedBal = saved?.data?.members?.[getCurrentPlayer()!.id]?.account?.balance
      expect(savedBal, `persisted balance after ${route.name}`).toBe(balanceAfterDrop)
    }

    act(() => root.unmount())
    host.remove()
  })
})
