// @vitest-environment happy-dom
/**
 * Sport → league → game browse drill-down. Picking a sport narrows the board to
 * that sport and surfaces only its leagues as a refinement; picking a league
 * narrows further. Proves the new Sport tier and the scoped league filter.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Account } from '../../core/index.js'
import type { SportsbookFeed } from '../provider.js'
import { EVENTS, createStore, resetFutures, resetOverlay } from '../index.js'
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
function chip(host: HTMLElement, group: string, re: RegExp): HTMLElement | undefined {
  return [...host.querySelectorAll<HTMLElement>(`${group} .chip`)].find((b) => re.test(b.textContent ?? ''))
}
const teams = (host: HTMLElement) =>
  [...host.querySelectorAll('.sb-board .sb-team')].map((n) => n.textContent)

beforeEach(() => {
  resetFutures()
  resetOverlay()
})
afterEach(() => {
  resetFutures()
  resetOverlay()
})

describe('Sportsbook — browse drill-down', () => {
  it('filters by sport, then by league within that sport', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const acct = account()
    const store = createStore(acct, { feed: stillFeed() })
    act(() => root.render(<Sportsbook account={acct} store={store} />))

    // the sport tier is present and there's no league sub-filter at "All sports"
    expect(chip(host, '.sb-sports', /All sports/)).toBeTruthy()
    expect(chip(host, '.sb-sports', /Basketball/)).toBeTruthy()
    expect(chip(host, '.sb-sports', /Soccer/)).toBeTruthy()
    expect(host.querySelector('.sb-leagues')).toBeNull()
    expect(teams(host)).toContain('Lakers') // everything shows at All sports

    // pick Soccer → only soccer games, and its leagues appear as a refinement
    click(chip(host, '.sb-sports', /^Soccer$/))
    expect(teams(host)).toContain('Real Madrid')
    expect(teams(host)).toContain('Arsenal')
    expect(teams(host)).not.toContain('Lakers')
    const leagueRow = host.querySelector('.sb-leagues')
    expect(leagueRow).not.toBeNull()
    expect(chip(host, '.sb-leagues', /La Liga/)).toBeTruthy()
    expect(chip(host, '.sb-leagues', /EPL/)).toBeTruthy()

    // refine to La Liga → only that league
    click(chip(host, '.sb-leagues', /La Liga/))
    expect(teams(host)).toContain('Real Madrid')
    expect(teams(host)).not.toContain('Arsenal')

    // a single-league sport (Hockey) shows no league refinement
    click(chip(host, '.sb-sports', /Hockey/))
    expect(host.querySelector('.sb-leagues')).toBeNull()
    expect(teams(host)).toContain('Avalanche')

    act(() => root.unmount())
    host.remove()
    store.destroy()
  })
})
