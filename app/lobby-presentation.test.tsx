// @vitest-environment happy-dom
/**
 * The casino lobby presentation (UI-polish lane). The lobby leads with the
 * "Originals" collection under a "Provably fair" eyebrow, renders every enabled
 * game as a card, and carries the live-activity strip above the grid — which
 * stays hidden until a real bet resolves, then surfaces the win in-lobby. This
 * locks that structure so the shell stays clean on an empty book and lights up
 * with play.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { App } from './App.js'
import { GAMES } from './games.js'
import { getCurrentPlayer } from './book-store.js'
import { clearLedger } from './ledger-store.js'
import { placeWager, resolveWager } from '../core/index.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  clearLedger()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('casino lobby presentation', () => {
  it('leads with the Originals collection and a card per enabled game', () => {
    act(() => root.render(<App />))

    expect(host.querySelector('.lobby-eyebrow')?.textContent).toMatch(/provably fair/i)
    expect(host.querySelector('.lobby-title')?.textContent).toBe('Originals')

    // A card for every registered game (all enabled by default). The lobby tile is
    // now the brand GameCard (components/brand): button.sds-gamecard, name in
    // .sds-gamecard__name.
    const cards = host.querySelectorAll('.lobby-grid .sds-gamecard')
    expect(cards.length).toBe(GAMES.length)
    expect(cards.length).toBeGreaterThan(10)
    // Each card carries a name.
    expect(host.querySelector('.sds-gamecard .sds-gamecard__name')?.textContent).toBeTruthy()
  })

  it('keeps the live-activity strip hidden until there is real play', () => {
    act(() => root.render(<App />))
    // Fresh, cleared feed → the strip renders nothing (no empty rail in the lobby).
    expect(host.querySelector('.lobby .activity')).toBeNull()
  })

  it('surfaces a resolved win in the lobby live strip', () => {
    vi.useFakeTimers()
    try {
      // A real, big win for the player we're seated as, graded through core.
      const acct = getCurrentPlayer()!.account
      const w = placeWager(acct, 1000)
      resolveWager(acct, w, 'win', 6) // 6× → a flagged big win
      act(() => vi.advanceTimersByTime(60)) // the feed's short anti-spoiler release

      act(() => root.render(<App />))

      const strip = host.querySelector('.lobby .activity')
      expect(strip).not.toBeNull()
      const row = strip!.querySelector('.activity-row')
      expect(row?.textContent).toMatch(/won/)
      expect(row?.classList.contains('is-big')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
