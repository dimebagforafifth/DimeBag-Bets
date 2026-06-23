/** Invoice export serializers (pure). */

import { describe, expect, it } from 'vitest'
import { invoiceCsv, invoiceJson } from './export.js'
import type { BillingPeriod } from './types.js'

const period: BillingPeriod = {
  id: 'inv-1',
  tenantId: 'default',
  weekStart: 0,
  weekEnd: 7 * 24 * 60 * 60 * 1000,
  activeHeadCount: 2,
  billedHeadCount: 2,
  baseCents: 1_000,
  addonCents: 0,
  discountCents: 0,
  totalCents: 1_000,
  currency: 'USD',
  status: 'issued',
  coverageComplete: true,
  snapshots: [
    {
      playerId: 'p1',
      playerName: 'Alice',
      agentId: 'a-1',
      agentName: 'Agent A',
      active: true,
      reason: 'settled-wager',
    },
    {
      playerId: 'p2',
      playerName: 'Bob, Jr',
      agentId: null,
      agentName: null,
      active: false,
      reason: 'no-activity',
    },
  ],
  createdAt: 0,
}

describe('invoice export', () => {
  it('CSV carries a fiat summary + one row per head, escaping commas', () => {
    const csv = invoiceCsv(period)
    expect(csv).toContain('total,$10.00')
    expect(csv).toContain('p1,Alice,a-1,Agent A,true,settled-wager')
    expect(csv).toContain('"Bob, Jr"') // comma in a name is quoted
    expect(csv).toContain('p2,"Bob, Jr",,,false,no-activity') // null agent id + name → empty cells
  })

  it('JSON round-trips the period', () => {
    expect(JSON.parse(invoiceJson(period)).id).toBe('inv-1')
    expect(JSON.parse(invoiceJson(period)).totalCents).toBe(1_000)
  })
})
