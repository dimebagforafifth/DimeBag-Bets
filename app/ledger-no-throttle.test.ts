/**
 * The ledger must NEVER throttle the next bet — across the board, forever.
 *
 * Every game's Play/Bet button re-enables the instant its own result is on screen
 * (each game gates on its LOCAL reveal state — a spinning/dealing/revealing flag in
 * betInvalid, or its round status). The shared ledger holds the LOG entry for
 * anti-spoiler, but it must NOT engage the cross-game "resolving" lock: doing so
 * left the button disabled for the full per-game fallback ceiling AFTER the result
 * was already visible — the cross-board "delay before you can bet again."
 *
 * This test locks the invariant: resolving a wager through core (which the ledger
 * observes via onWagerResolved) never makes isResolving() report true — for any
 * game, win or loss, including the longest-ceiling animated games. If anyone ever
 * re-engages the lock in the ledger, this fails.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { placeWager, resolveWager, resolveAtMultiplier, type Account } from '../core/index.js'
import { isResolving } from '../games/shared/reveal-bus.js'
import { setActiveGame, clearLedger, getLedger } from './ledger-store.js' // importing registers the ledger listener

function account(): Account {
  return { id: 'p1', creditLimit: 1_000_000, balance: 0, pending: 0 }
}

// Fake timers so each game's anti-spoiler fallback setTimeout never fires
// spuriously across tests (the ledger is a module singleton). We assert the state
// right after a resolve, before any reveal/fallback — no timer advance needed.
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

// A spread across the spectrum: longest fallback ceilings (roulette/cases/wheel),
// a mid animated reveal (keno), an instant/spammable game (dice), and a signalling
// game (plinko). If the lock were engaged, the long-ceiling ones would report true.
const GAMES: [string, string][] = [
  ['roulette', 'Roulette'],
  ['cases', 'Cases'],
  ['wheel', 'Wheel'],
  ['keno', 'Keno'],
  ['dice', 'Dice'],
  ['plinko', 'Plinko'],
]

describe('the ledger never throttles the next bet', () => {
  it('isResolving stays false right after a resolve, for every game (win or loss)', () => {
    for (const [key, name] of GAMES) {
      clearLedger()
      setActiveGame(key, name)
      const a = account()

      // A loss…
      resolveWager(a, placeWager(a, 1000), 'loss')
      expect(isResolving(a.id), `${key} loss must not throttle betting`).toBe(false)

      // …and a win — neither may lock the Play button.
      resolveAtMultiplier(a, placeWager(a, 1000), 2)
      expect(isResolving(a.id), `${key} win must not throttle betting`).toBe(false)
    }
  })

  it('still HOLDS the log entry (anti-spoiler intact) while never throttling', () => {
    setActiveGame('roulette', 'Roulette') // a long (4.8s) reveal ceiling
    const a = account()
    const before = getLedger().length

    resolveWager(a, placeWager(a, 1000), 'loss')

    // The new log entry is held back (won't spoil the spin)…
    expect(getLedger().length).toBe(before)
    // …but the player can bet again immediately — the figure already moved.
    expect(isResolving(a.id)).toBe(false)
  })
})
