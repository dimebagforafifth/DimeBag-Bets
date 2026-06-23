import { describe, expect, it } from 'vitest'
import { buildRecord } from './record.js'
import { shareableSummary } from './share.js'
import type { BetRow, RecordInput } from './types.js'

const NOW = 1_700_000_000_000
const tierFor = () => ({
  current: {
    id: 'gold' as const,
    name: 'Gold',
    color: '#d6b14a',
    minWagered: 5_000_000,
    freePlayReward: 0,
    perks: [],
  },
  next: null,
  pct: 1,
  remaining: 0,
})

function sampleRecord() {
  const rows: BetRow[] = [
    {
      id: 1,
      accountId: 'p',
      gameKey: 'crash',
      game: 'Crash',
      stake: 1000,
      multiplier: 24,
      profit: 23000,
      outcome: 'win',
      time: NOW - 1000,
    },
    {
      id: 2,
      accountId: 'p',
      gameKey: 'dice',
      game: 'Dice',
      stake: 2000,
      multiplier: 0,
      profit: -2000,
      outcome: 'loss',
      time: NOW - 2000,
    },
    {
      id: 3,
      accountId: 'p',
      gameKey: 'crash',
      game: 'Crash',
      stake: 1000,
      multiplier: 2,
      profit: 1000,
      outcome: 'win',
      time: NOW - 3000,
    },
  ]
  const input: RecordInput = {
    accountId: 'p',
    name: 'Dana',
    rows,
    clv: [],
    now: NOW,
    demoSeeded: false,
  }
  return buildRecord(input, tierFor)
}

describe('shareableSummary — exportable but anchored to the platform', () => {
  it('names the platform, the player, and the record headline', () => {
    const text = shareableSummary(sampleRecord())
    expect(text).toContain('DimeBag-Bets')
    expect(text).toContain('Dana')
    expect(text).toMatch(/Gold tier/)
    expect(text).toMatch(/Net/)
    expect(text).toMatch(/ROI/)
  })

  it('carries the fingerprint and the no-cash-value disclosure (anchoring)', () => {
    const rec = sampleRecord()
    const text = shareableSummary(rec)
    expect(text).toContain(rec.integrity.fingerprint.slice(0, 12))
    expect(text).toMatch(/no cash value/i)
  })

  it('lists the biggest hit when one exists', () => {
    expect(shareableSummary(sampleRecord())).toMatch(/Biggest hit:.*24×.*Crash/)
  })
})
