/**
 * Slots is wired into the games registry (CLAUDE.md §5) — adding a game is ONE
 * entry in `GAMES`, and from there the hub, routing, and shared balance need no
 * other change. This proves the entry is present and reachable, and that a spin
 * settles through the shared `core` (place → resolve → adjust, §3) like every
 * other game — no module-local points.
 */

import { describe, it, expect } from 'vitest'
import { GAMES, findGame } from './games.js'
import type { Account } from '../core/index.js'
import { availableToWager } from '../core/index.js'
import { playSlots, randomServerSeed } from '../games/slots/index.js'

describe('Slots — registered in the casino hub', () => {
  it('appears exactly once in the registry and is reachable by key', () => {
    const entries = GAMES.filter((g) => g.key === 'slots')
    expect(entries).toHaveLength(1)

    const def = findGame('slots')
    expect(def).not.toBeNull()
    expect(def!.name).toBe('Slots')
    expect(def!.Component).toBeTruthy() // a lazy-loaded view, like every other game
  })

  it('settles a spin through the shared core — hold released, figure adjusted', () => {
    const account: Account = { id: 'p1', creditLimit: 100_000, balance: 0, pending: 0 }
    const before = availableToWager(account)

    const round = playSlots(account, {
      stake: 1000,
      clientSeed: 'registry-test',
      nonce: 1,
      serverSeed: randomServerSeed(),
    })

    // place → resolve → adjust: the stake hold is fully released.
    expect(account.pending).toBe(0)
    // the figure moved by exactly the round's profit (win multiplier settlement).
    expect(account.balance).toBe(round.profit)
    expect(round.profit).toBe(Math.round(1000 * (round.multiplier - 1)))
    // nothing leaked: available-to-wager nets back to the start plus the profit.
    expect(availableToWager(account)).toBe(before + round.profit)
  })
})
