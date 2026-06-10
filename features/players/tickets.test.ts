// @vitest-environment happy-dom
/** The open-ticket queue holds real core wagers and grades them through core. */
import { describe, it, expect, beforeEach } from 'vitest'
import { getBook } from '../../app/book-store.js'
import {
  addTicket,
  gradeTicket,
  listOpenTickets,
  riskOf,
  toWinOf,
  __resetTickets,
} from './tickets.js'

const acct = (id: string) => getBook().members[id].account

describe('open-ticket queue (core-backed)', () => {
  beforeEach(() => __resetTickets())

  it('placing a ticket holds the stake in core pending', () => {
    const before = acct('p-lena').pending
    const t = addTicket('p-lena', 1000, 2.0, { sport: 'NFL', type: 'Spread', selection: '−3.5' })
    expect(riskOf(t)).toBe(1000)
    expect(acct('p-lena').pending).toBe(before + 1000)
    expect(listOpenTickets().length).toBe(1)
  })

  it('grading a WIN pays the price through core and clears the hold', () => {
    const bal = acct('p-lena').balance
    const t = addTicket('p-lena', 1000, 2.5, { sport: 'NBA', type: 'Total', selection: 'Over' })
    expect(toWinOf(t)).toBe(1500) // 1000 × (2.5 − 1)
    gradeTicket(t.id, 'win')
    expect(acct('p-lena').balance).toBe(bal + 1500)
    expect(acct('p-lena').pending).toBe(0)
    expect(listOpenTickets().length).toBe(0)
  })

  it('LOSS takes the stake; PUSH and VOID return it', () => {
    const start = acct('p-priya').balance
    const a = addTicket('p-priya', 800, 2.0, { sport: 'NHL', type: 'Moneyline', selection: 'Home' })
    gradeTicket(a.id, 'loss')
    expect(acct('p-priya').balance).toBe(start - 800)

    const afterLoss = acct('p-priya').balance
    const b = addTicket('p-priya', 500, 2.0, { sport: 'NHL', type: 'Total', selection: 'Under' })
    gradeTicket(b.id, 'push')
    expect(acct('p-priya').balance).toBe(afterLoss)

    const c = addTicket('p-priya', 500, 2.0, { sport: 'NHL', type: 'Spread', selection: '−1.5' })
    gradeTicket(c.id, 'void')
    expect(acct('p-priya').balance).toBe(afterLoss)
    expect(acct('p-priya').pending).toBe(0)
    expect(listOpenTickets().length).toBe(0)
  })
})
