// @vitest-environment happy-dom
/**
 * "It works in the game, but when I click OUTSIDE Plinko the balance changes
 * don't register." This drives the real <App/> through EVERY way of leaving the
 * Plinko view — the ← Casino crumb, and each top nav tab (Casino, Sportsbook, My
 * Bets, Leaderboard, Management) — checking the top-right Figure after each, and
 * also that the change was persisted to storage (so a reload wouldn't revert it).
 */

import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { availableToWager } from '../core/index.js'
import { App } from './App.js'
import { getCurrentPlayer } from './book-store.js'
import { formatMoney } from '../games/shared/money.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Plinko now mints its server seed from the fairness authority. Force the in-process (local)
// authority so the drop never opens a real socket (happy-dom's fetch would ECONNREFUSED) — the
// mint stays deterministic, and the drop settles on a microtask flush.
vi.mock('../games/shared/fair.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../games/shared/fair.js')>()
  return {
    ...actual,
    fairnessClient: actual.createFairnessClient({
      fetchImpl: (() => {
        throw new Error('offline')
      }) as unknown as typeof fetch,
    }),
  }
})

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
async function openPlinkoAndDrop(host: HTMLElement): Promise<void> {
  // From wherever we are, get to the casino lobby, open Plinko, drop a ball. Every section
  // is a first-class sidebar item now (no "More" dropdown), so leaving is one click.
  click(host, 'button.psa-nav-item', /^casino$/i)
  if (!click(host, 'button.sds-gamecard', /plinko/i)) throw new Error('no Plinko card')
  // The game view is a lazy() chunk: await its dynamic import (the same module
  // promise React.lazy is suspended on) so React can commit it, then click Play.
  await act(async () => {
    await import('../games/plinko/ui/PlinkoGame.js')
  })
  if (!click(host, 'button.action', /^play$/i)) throw new Error('no Play button')
  // The drop's server seed is minted from the authority (async) — flush microtasks so the
  // wager settles (pending → 0, balance moved) before the caller reads the figure.
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })
}

describe('leaving Plinko by any route keeps the balance change', () => {
  it('every nav route shows the post-drop figure, and the change is persisted', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    act(() => root.render(<App />))

    const acct = getCurrentPlayer()!.account

    // Each row: leave Plinko via this route, then assert the figure still reflects
    // the freshly dropped bet and the underlying balance didn't revert.
    const routes: Array<{ name: string; go: () => void; console?: boolean }> = [
      { name: '← Casino crumb', go: () => void click(host, 'button.crumb', /casino/i) },
      { name: 'My Bets tab', go: () => void click(host, 'button.psa-nav-item', /my bets/i) },
      {
        name: 'Sportsbook tab',
        go: () => void click(host, 'button.psa-nav-item', /sportsbook/i),
      },
      {
        name: 'Leaderboard tab',
        go: () => void click(host, 'button.psa-nav-item', /leaderboard/i),
      },
      {
        name: 'Management tab',
        go: () => void click(host, 'button.psa-nav-item', /management/i),
        console: true,
      },
      { name: 'Casino tab', go: () => void click(host, 'button.psa-nav-item', /^casino$/i) },
    ]

    for (const route of routes) {
      await openPlinkoAndDrop(host)
      const balanceAfterDrop = acct.balance
      // The topbar leads with Balance (what you can bet = availableToWager), which moves
      // with the figure since a Plinko drop settles immediately (pending stays 0). Sanity:
      // it already shows the new balance in-game (the plinko page keeps the player topbar).
      expect(figure(host), `in-game Balance before leaving via ${route.name}`).toBe(
        formatMoney(availableToWager(acct)),
      )

      route.go() // click outside Plinko

      // The change must still be reflected after leaving this way.
      expect(acct.balance, `balance reverted after ${route.name}`).toBe(balanceAfterDrop)
      if (route.console) {
        // The operator console replaces the player topbar with its OWN chrome (it shows
        // aggregate operator figures, not the player WalletPill) — assert we actually
        // landed there; the balance + persistence checks still guard the change.
        expect(host.querySelector('.console'), `console after ${route.name}`).not.toBeNull()
      } else {
        expect(figure(host), `Balance after leaving via ${route.name}`).toBe(
          formatMoney(availableToWager(acct)),
        )
      }

      // And it must be PERSISTED — a reload reads this back, so it can't "un-register".
      const saved = JSON.parse(localStorage.getItem('dimebag:book.org') ?? '{}')
      const savedBal = saved?.data?.members?.[getCurrentPlayer()!.id]?.account?.balance
      expect(savedBal, `persisted balance after ${route.name}`).toBe(balanceAfterDrop)
    }

    act(() => root.unmount())
    host.remove()
    // Heavy end-to-end pass: six routes, each doing a full <App/> render, a lazy
    // PlinkoGame chunk import, and a drop settle. The brand reskin (WalletPill/
    // GameCard + the new "More" dropdown nav) added render work, tipping the body
    // past Vitest's 5s default on slower CI/hardware. Give it the same 20s budget
    // the other app-level integration tests use (player-sections, baccarat engine).
  }, 20000)
})
