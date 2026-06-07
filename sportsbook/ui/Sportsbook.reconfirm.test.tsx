// @vitest-environment happy-dom
/**
 * §4 bet acceptance — re-confirm on a line move. A pick sits in the slip; the book
 * then moves that line. The slip must flag the moved leg and replace Place with
 * "Accept new prices" — no silent re-quote — and only after the player accepts the
 * new line does Place return.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Account } from '../../core/index.js'
import type { SportsbookFeed } from '../provider.js'
import { EVENTS, createStore, nudgeLine, resetFutures, resetOverlay } from '../index.js'
import { Sportsbook } from './Sportsbook.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function account(): Account {
  return { id: 'p1', creditLimit: 1_000_000, balance: 0, pending: 0 }
}
function stillFeed(): SportsbookFeed {
  return {
    snapshot: () => EVENTS.map((e) => ({ ...e, status: 'upcoming' as const })),
    subscribe: () => () => {},
    start() {},
    stop() {},
  }
}
const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click())
function priceByText(host: HTMLElement, re: RegExp): HTMLElement | undefined {
  return [...host.querySelectorAll<HTMLElement>('.sb-price')].find((b) => re.test(b.textContent ?? ''))
}

beforeEach(() => {
  resetFutures()
  resetOverlay()
})
afterEach(() => {
  resetFutures()
  resetOverlay()
})

describe('Sportsbook — re-confirm on line move (§4)', () => {
  it('flags a moved leg and requires accepting the new line before placing', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const acct = account()
    const store = createStore(acct, { feed: stillFeed() })
    act(() => root.render(<Sportsbook account={acct} store={store} />))

    // add the Lakers −3.5 spread to the slip
    click(priceByText(host, /Lakers\s*-3\.5/))
    expect(host.querySelector('.sb-slip .sb-leg')).not.toBeNull()
    expect(host.querySelector('.sb-slip .action-bet')).not.toBeNull() // ready to place
    expect(host.querySelector('.sb-slip .action-accept')).toBeNull()

    // the book moves the spread: −3.5 → −4.5
    act(() => nudgeLine('nba-lal-bos', 'spread', -1))

    // the leg is flagged moved and Place is replaced by "Accept new prices"
    expect(host.querySelector('.sb-slip .sb-leg.is-moved')).not.toBeNull()
    expect(host.querySelector('.sb-leg-moved')?.textContent).toBe('moved')
    const accept = host.querySelector('.sb-slip .action-accept')
    expect(accept).not.toBeNull()
    expect(accept?.textContent).toBe('Accept new prices')
    expect(host.querySelector('.sb-slip .action-bet')).toBeNull() // can't place yet
    // the slip already shows the new line
    expect(host.querySelector('.sb-slip .sb-leg-label')?.textContent).toMatch(/Lakers\s*-4\.5/)

    // accept → the moved flag clears and Place returns
    click(accept)
    expect(host.querySelector('.sb-slip .sb-leg.is-moved')).toBeNull()
    expect(host.querySelector('.sb-slip .action-accept')).toBeNull()
    expect(host.querySelector('.sb-slip .action-bet')).not.toBeNull()

    // and the bet now places at the accepted line
    click(host.querySelector('.sb-slip .action-bet'))
    expect(acct.pending).toBe(1000)

    act(() => root.unmount())
    host.remove()
    store.destroy()
  })
})
