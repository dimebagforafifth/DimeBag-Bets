import { describe, it, expect } from 'vitest'
import {
  toDelta,
  previewBalance,
  dayWindows,
  dayNet,
  filterLedger,
  rowsToCsv,
  DAY_MS,
} from './data.js'

describe('toDelta / previewBalance (Grant / Deduct / Set)', () => {
  it('grant adds, deduct subtracts', () => {
    expect(toDelta('grant', 500, 1000)).toBe(500)
    expect(toDelta('deduct', 500, 1000)).toBe(-500)
  })
  it('set expresses target as a signed delta off the current balance', () => {
    expect(toDelta('set', 2500, 1000)).toBe(1500) // up to 2500
    expect(toDelta('set', 250, 1000)).toBe(-750) // down to 250
    expect(toDelta('set', 1000, 1000)).toBe(0) // no-op (caller must skip)
  })
  it('previewBalance lands on the expected figure', () => {
    expect(previewBalance('grant', 500, 1000)).toBe(1500)
    expect(previewBalance('deduct', 1200, 1000)).toBe(-200) // operators may go negative (credit)
    expect(previewBalance('set', 2500, 1000)).toBe(2500)
  })
})

describe('dayWindows', () => {
  const now = new Date('2026-06-09T15:30:00').getTime()
  it('returns N contiguous day windows, oldest→newest, ending today', () => {
    const w = dayWindows(now, 7)
    expect(w).toHaveLength(7)
    for (let i = 1; i < w.length; i++) {
      expect(w[i].start).toBe(w[i - 1].end) // contiguous
      expect(w[i].end - w[i].start).toBe(DAY_MS)
    }
    // last window contains `now`
    const last = w[w.length - 1]
    expect(now).toBeGreaterThanOrEqual(last.start)
    expect(now).toBeLessThan(last.end)
  })
  it('each window starts at local midnight and is labelled by weekday', () => {
    const w = dayWindows(now, 3)
    for (const d of w) {
      const dt = new Date(d.start)
      expect([dt.getHours(), dt.getMinutes(), dt.getSeconds()]).toEqual([0, 0, 0])
      expect(d.label).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/)
      expect(d.iso).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('dayNet', () => {
  const recs = [
    { accountId: 'p1', time: 100, profit: 500 },
    { accountId: 'p1', time: 150, profit: -200 },
    { accountId: 'p2', time: 120, profit: 9999 }, // other player
    { accountId: 'p1', time: 300, profit: 1000 }, // out of range
  ]
  it('sums signed profit only for the account inside [start,end)', () => {
    expect(dayNet(recs, 'p1', 0, 200)).toBe(300) // 500 - 200
    expect(dayNet(recs, 'p1', 0, 300)).toBe(300) // 300 is exclusive
    expect(dayNet(recs, 'p1', 0, 301)).toBe(1300)
    expect(dayNet(recs, 'nobody', 0, 1000)).toBe(0)
  })
})

describe('filterLedger', () => {
  const entries = [
    { accountId: 'p1', kind: 'resolve', at: 100 },
    { accountId: 'p2', kind: 'adjust', at: 200 },
    { accountId: 'p1', kind: 'settle', at: 300 },
  ]
  it('filters by account, kind and date independently and combined', () => {
    expect(filterLedger(entries, { accountId: 'p1' })).toHaveLength(2)
    expect(filterLedger(entries, { kind: 'adjust' })).toHaveLength(1)
    expect(filterLedger(entries, { from: 150, to: 250 })).toHaveLength(1)
    expect(filterLedger(entries, { accountId: 'p1', kind: 'resolve' })).toHaveLength(1)
    expect(filterLedger(entries, {})).toHaveLength(3) // empty filter = passthrough
  })
})

describe('rowsToCsv', () => {
  it('writes a header + escapes commas/quotes/newlines', () => {
    const csv = rowsToCsv([{ name: 'Ann', net: 1200 }], ['name', 'net'])
    expect(csv).toBe('name,net\nAnn,1200')
    const tricky = rowsToCsv([{ a: 'x,y', b: 'he said "hi"' }])
    expect(tricky).toBe('a,b\n"x,y","he said ""hi"""')
  })
  it('is empty for no rows', () => {
    expect(rowsToCsv([])).toBe('')
  })
})
