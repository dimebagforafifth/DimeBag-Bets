// @vitest-environment happy-dom
/**
 * Player futures flow, end to end through the store + shared core: switch to the
 * Futures tab, back an outright, place it (stake held in pending), then the
 * operator settles the market and the bet grades to a win in My Bets — the figure
 * moving the whole way. Proves futures are a real bettable type, not preview code.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Account } from '../../core/index.js'
import type { SportsbookFeed } from '../provider.js'
import { EVENTS, createStore, resetFutures, resetOverlay, settleFuture } from '../index.js'
import { Sportsbook } from './Sportsbook.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function account(): Account {
  return { id: 'p1', creditLimit: 1_000_000, balance: 0, pending: 0 }
}
/** A still feed (no timers) — futures don't depend on the game slate. */
function stillFeed(): SportsbookFeed {
  return {
    snapshot: () => EVENTS.map((e) => ({ ...e, status: 'upcoming' as const })),
    subscribe: () => () => {},
    start() {},
    stop() {},
  }
}
const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click())
function byText<T extends Element>(host: HTMLElement, sel: string, re: RegExp): T | undefined {
  return [...host.querySelectorAll<T>(sel)].find((n) => re.test(n.textContent ?? ''))
}

beforeEach(() => {
  resetFutures()
  resetOverlay()
})
afterEach(() => {
  resetFutures()
  resetOverlay()
})

describe('Sportsbook — futures', () => {
  it('backs an outright through core and grades it when the operator settles', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const acct = account()
    const store = createStore(acct, { feed: stillFeed() })
    act(() => root.render(<Sportsbook account={acct} store={store} />))

    // switch to the Futures tab
    click(byText(host, '.sb-tabs .chip', /^Futures$/))
    const markets = host.querySelectorAll('.sb-futmkt')
    expect(markets.length).toBeGreaterThanOrEqual(2) // NBA champ + Super Bowl

    // back the first outcome of the first market (NBA champ → Celtics +350)
    const firstOutcome = markets[0].querySelector('.sb-fut-out')
    click(firstOutcome)
    expect(host.querySelector('.sb-futbar')).not.toBeNull() // the place bar appears

    // place it — the $10 default stake is held in pending via core
    click(host.querySelector('.sb-futbar-place'))
    expect(acct.pending).toBe(1000)
    expect(host.querySelector('.sb-futbar')).toBeNull() // cleared after placing
    // it shows in My Bets as an open future
    expect(byText(host, '.sb-ticket .sb-ticket-kind', /Future/)).toBeTruthy()

    // the operator declares the winner → the future grades to a win through core
    act(() => settleFuture('nba-champ-2026', 'bos'))
    expect(acct.pending).toBe(0)
    expect(acct.balance).toBe(3500) // +350 → 4.5×, profit 3.5× the $10
    expect(byText(host, '.sb-ticket .sb-ticket-status', /Won/)).toBeTruthy()

    act(() => root.unmount())
    host.remove()
    store.destroy()
  })
})
