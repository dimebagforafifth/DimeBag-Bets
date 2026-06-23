import { describe, expect, it } from 'vitest'
import type { RankProgress } from '../vip/index.js'
import {
  buildRecord,
  fingerprint,
  highlights,
  periodStats,
  streaks,
  withinPeriod,
} from './record.js'
import type { BetRow, RecordInput } from './types.js'

const row = (over: Partial<BetRow> = {}): BetRow => ({
  id: 1,
  accountId: 'p',
  gameKey: 'crash',
  game: 'Crash',
  stake: 1000,
  multiplier: 0,
  profit: -1000,
  outcome: 'loss',
  time: 0,
  ...over,
})
const win = (profit: number, mult: number, over: Partial<BetRow> = {}) =>
  row({ outcome: 'win', multiplier: mult, profit, ...over })

const RANK = (): RankProgress => ({
  current: {
    id: 'bronze',
    name: 'Bronze',
    color: '#cd7f32',
    minWagered: 0,
    freePlayReward: 0,
    perks: [],
  },
  next: {
    id: 'silver',
    name: 'Silver',
    color: '#bbb',
    minWagered: 1_000_000,
    freePlayReward: 0,
    perks: [],
  },
  pct: 0.5,
  remaining: 500_000,
})
const tierFor = () => RANK()

describe('periodStats', () => {
  it('computes wagered, net, W/L, pushes, decided, win rate and ROI', () => {
    const rows = [
      win(500, 1.5, { id: 1, stake: 1000 }),
      row({ id: 2, stake: 1000 }), // loss -1000
      row({ id: 3, stake: 1000, outcome: 'push', multiplier: 1, profit: 0 }),
      win(2000, 3, { id: 4, stake: 1000 }),
    ]
    const s = periodStats(rows)
    expect(s.bets).toBe(4)
    expect(s.wagered).toBe(4000)
    expect(s.net).toBe(1500)
    expect(s.wins).toBe(2)
    expect(s.losses).toBe(1)
    expect(s.pushes).toBe(1)
    expect(s.decided).toBe(3)
    expect(s.winRate).toBeCloseTo((2 / 3) * 100)
    expect(s.roi).toBeCloseTo(1500 / 4000)
  })

  it('is zero-safe on an empty history (no NaN ROI/win rate)', () => {
    const s = periodStats([])
    expect(s).toMatchObject({ bets: 0, wagered: 0, net: 0, winRate: 0, roi: 0 })
  })
})

describe('streaks (push/void skipped)', () => {
  it('tracks current trailing run and longest win/loss runs', () => {
    const rows = [
      win(10, 2, { id: 1, time: 1 }),
      win(10, 2, { id: 2, time: 2 }),
      row({ id: 3, time: 3 }), // loss
      row({ id: 4, time: 4, outcome: 'push', multiplier: 1, profit: 0 }), // skipped
      win(10, 2, { id: 5, time: 5 }),
    ]
    const s = streaks(rows)
    expect(s.longestWin).toBe(2)
    expect(s.longestLoss).toBe(1)
    expect(s.current).toBe(1)
    expect(s.currentKind).toBe('win')
  })

  it('a push between two wins does NOT break the streak', () => {
    const rows = [
      win(10, 2, { id: 1, time: 1 }),
      row({ id: 2, time: 2, outcome: 'void', multiplier: 1, profit: 0 }),
      win(10, 2, { id: 3, time: 3 }),
    ]
    expect(streaks(rows)).toMatchObject({ current: 2, currentKind: 'win', longestWin: 2 })
  })

  it('returns none for an all-push history', () => {
    const rows = [row({ id: 1, outcome: 'push', multiplier: 1, profit: 0 })]
    expect(streaks(rows)).toMatchObject({ current: 0, currentKind: 'none' })
  })
})

describe('highlights', () => {
  it('finds the biggest win and biggest loss', () => {
    const rows = [
      win(500, 1.5, { id: 1 }),
      win(9000, 10, { id: 2 }),
      row({ id: 3, stake: 4000, profit: -4000 }),
    ]
    const { biggestWin, biggestLoss } = highlights(rows)
    expect(biggestWin?.profit).toBe(9000)
    expect(biggestLoss?.profit).toBe(-4000)
  })

  it('returns null where there is no win or no loss', () => {
    expect(highlights([win(10, 2)]).biggestLoss).toBeNull()
    expect(highlights([row()]).biggestWin).toBeNull()
  })
})

describe('withinPeriod', () => {
  it('keeps only rows settled within the window', () => {
    const now = 1_000_000_000
    const rows = [row({ id: 1, time: now - 1000 }), row({ id: 2, time: now - 999_999 })]
    expect(withinPeriod(rows, now, 5000).map((r) => r.id)).toEqual([1])
  })
})

describe('fingerprint', () => {
  it('is deterministic and order-independent', () => {
    const a = [row({ id: 1 }), win(10, 2, { id: 2 })]
    const b = [win(10, 2, { id: 2 }), row({ id: 1 })]
    expect(fingerprint(a)).toBe(fingerprint(b))
  })

  it('changes when any settled outcome changes (tamper-evident)', () => {
    const base = [row({ id: 1, profit: -1000 })]
    const tampered = [row({ id: 1, profit: 5000, outcome: 'win', multiplier: 6 })]
    expect(fingerprint(base)).not.toBe(fingerprint(tampered))
  })
})

describe('buildRecord', () => {
  const input = (rows: BetRow[], over: Partial<RecordInput> = {}): RecordInput => ({
    accountId: 'p',
    name: 'Tester',
    rows,
    clv: [],
    now: 1_000_000_000,
    demoSeeded: false,
    ...over,
  })

  it('assembles lifetime stats, tier (from injected ladder), splits and a matching fingerprint', () => {
    const rows = [
      win(500, 1.5, { id: 1, gameKey: 'crash', game: 'Crash', time: 999_999_000 }),
      row({ id: 2, gameKey: 'sportsbook', game: 'Sportsbook', stake: 1000, time: 999_999_500 }),
    ]
    const rec = buildRecord(input(rows), tierFor)
    expect(rec.lifetime.bets).toBe(2)
    expect(rec.tier.current.id).toBe('bronze')
    expect(rec.side.casino.bets).toBe(1)
    expect(rec.side.sportsbook.bets).toBe(1)
    expect(rec.integrity.fingerprint).toBe(fingerprint(rows))
    expect(rec.integrity.source).toBe('settled-ledger')
    expect(rec.recentBets.length).toBe(2)
    // highlights carry the ledger id (stable React key / traceability)
    expect(rec.recentBets.every((b) => typeof b.id === 'number')).toBe(true)
  })

  it('does NOT mutate its input rows', () => {
    const rows = [win(10, 2, { id: 2, time: 2 }), row({ id: 1, time: 1 })]
    const snapshot = JSON.stringify(rows)
    buildRecord(input(rows), tierFor)
    expect(JSON.stringify(rows)).toBe(snapshot)
  })

  it('is a pure function of its input (same in → same out, fingerprint included)', () => {
    const rows = [win(500, 1.5, { id: 1 }), row({ id: 2 })]
    expect(JSON.stringify(buildRecord(input(rows), tierFor))).toBe(
      JSON.stringify(buildRecord(input(rows), tierFor)),
    )
  })
})
