/**
 * Tournament auto-settle through the shell: when a tournament window closes, the shell
 * pays in-the-money players onto their LIVE book account (free-play via core.grant),
 * idempotently, and never while the window is still open.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { settleEndedTournaments, __resetTournamentSettle } from './tournament-settle.js'
import { __resetGamification, updateConfig, recordPlay, getConfig } from '../gamification/index.js'
import { getBook } from './book-store.js'

const bal = (id: string) => getBook().members[id].account.balance

afterEach(() => {
  __resetTournamentSettle()
  __resetGamification()
})

describe('tournament auto-settle (shell)', () => {
  it('a closed tournament pays the ranked players from their book account, once', () => {
    __resetGamification()
    // Re-window the default tournament so it closes at T=1000.
    updateConfig((c) => {
      c.tournaments[0].startsAt = 0
      c.tournaments[0].endsAt = 1000
    })
    const id = getConfig().tournaments[0].id

    // Three seeded players wager DURING the window → tournament entries (by wagered desc).
    recordPlay('p-marco', { stake: 3000, profit: 0, outcome: 'loss' }, 500)
    recordPlay('p-lena', { stake: 2000, profit: 0, outcome: 'loss' }, 500)
    recordPlay('p-tariq', { stake: 1000, profit: 0, outcome: 'loss' }, 500)

    const before = { marco: bal('p-marco'), lena: bal('p-lena'), tariq: bal('p-tariq') }

    // The window has closed (now=2000 > endsAt=1000). The shell settles.
    const paid = settleEndedTournaments(2000)
    expect(paid).toContain(id)

    // Pool $100 split 50/30/20 → marco $50, lena $30, tariq $20, onto their book figure.
    expect(bal('p-marco')).toBe(before.marco + 5000)
    expect(bal('p-lena')).toBe(before.lena + 3000)
    expect(bal('p-tariq')).toBe(before.tariq + 2000)

    // Idempotent: settling again pays no one twice.
    expect(settleEndedTournaments(2000)).toEqual([])
    expect(bal('p-marco')).toBe(before.marco + 5000)
  })

  it('does not settle while the window is still open', () => {
    __resetGamification() // the default tournament runs until 2100
    const before = bal('p-marco')
    recordPlay('p-marco', { stake: 3000, profit: 0, outcome: 'loss' }, Date.now())
    expect(settleEndedTournaments(Date.now())).toEqual([])
    expect(bal('p-marco')).toBe(before)
  })
})
