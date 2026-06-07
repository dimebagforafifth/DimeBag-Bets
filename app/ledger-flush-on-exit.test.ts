/**
 * Leaving a game must not leave a just-placed bet looking forfeit.
 *
 * Casino games (e.g. Plinko) resolve the wager AT the drop — core credits the
 * figure immediately, the animation is cosmetic. But the ledger holds each entry
 * until the on-screen reveal finishes (anti-spoiler), falling back to a per-game
 * safety timer if no reveal signal arrives. If you drop a ball and click out
 * before it lands, that signal never fires, so without a flush the bet would sit
 * invisible in the log for up to ~2.2s — which reads as "my bet was forfeit."
 * setActiveGame() flushes the game you left so the record catches up at once. The
 * money was always correct; this proves the VISIBLE record does too. (The Play
 * button is never throttled by the ledger — see ledger-no-throttle.test.ts.)
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { type Account } from '../core/index.js'
import { playPlinko } from '../games/plinko/index.js'
import { isResolving } from '../games/shared/reveal-bus.js'
import { getLedger, clearLedger, setActiveGame } from './ledger-store.js'

function account(over: Partial<Account> = {}): Account {
  return { id: 'p1', creditLimit: 1_000_000, balance: 0, pending: 0, ...over }
}

describe('a bet dropped right before you click out is not forfeit', () => {
  beforeEach(() => {
    clearLedger()
    setActiveGame('casino', 'Casino') // start from the lobby
  })

  it('credits the figure at the drop and flushes the held entry the instant you leave', () => {
    const a = account({ balance: 50_000 })
    setActiveGame('plinko', 'Plinko') // open the game

    const before = a.balance
    const shownBefore = getLedger().length

    // Drop a ball — resolves immediately (figure moves now), entry held for reveal.
    const r = playPlinko(a, { stake: 1_000, rows: 8, risk: 'high', clientSeed: 's', nonce: 1 })

    // Money is correct the moment you drop, regardless of the animation/navigation.
    expect(a.pending).toBe(0) // nothing stranded
    expect(a.balance - before).toBe(r.profit) // figure already moved by the outcome

    // The visible record is HELD (reveal hasn't happened), yet betting is free.
    expect(getLedger().length).toBe(shownBefore)
    expect(isResolving(a.id)).toBe(false) // betting is never throttled by the ledger

    // Click out before the ball lands — no reveal signal ever fires for it.
    setActiveGame('casino', 'Casino')

    // The held bet is now posted to the log — no lingering.
    expect(getLedger().length).toBe(shownBefore + 1)
    expect(getLedger()[0].gameKey).toBe('plinko')
    expect(getLedger()[0].profit).toBe(r.profit)
    expect(isResolving(a.id)).toBe(false)
    expect(a.pending).toBe(0)
  })

  it('flushes every in-flight ball (Auto stream) on exit, none lost', () => {
    const a = account({ balance: 200_000 })
    setActiveGame('plinko', 'Plinko')

    let net = 0
    for (let n = 1; n <= 12; n++) {
      net += playPlinko(a, { stake: 1_000, rows: 8, risk: 'high', clientSeed: 's', nonce: n }).profit
    }
    // All resolved; held pending their reveals; nothing shown yet.
    expect(getLedger().length).toBe(0)
    expect(isResolving(a.id)).toBe(false) // betting is never throttled by the ledger

    setActiveGame('casino', 'Casino') // leave with 12 balls still "falling"

    // Every one posted and the figure equals the summed outcome.
    expect(getLedger().length).toBe(12)
    expect(isResolving(a.id)).toBe(false)
    expect(a.balance).toBe(200_000 + net)
    expect(a.pending).toBe(0)
  })

  it('does not touch a different game\'s held bets when you leave', () => {
    const a = account({ balance: 50_000 })
    // A held bet from a game you are NOT leaving must stay held (still on screen).
    setActiveGame('plinko', 'Plinko')
    playPlinko(a, { stake: 1_000, rows: 8, risk: 'high', clientSeed: 's', nonce: 1 })
    // Re-opening the same game (key unchanged) is not "leaving" — no flush.
    setActiveGame('plinko', 'Plinko')
    expect(getLedger().length).toBe(0)
    expect(isResolving(a.id)).toBe(false) // betting is never throttled by the ledger
  })
})
