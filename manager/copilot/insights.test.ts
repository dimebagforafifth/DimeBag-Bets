import { describe, it, expect } from 'vitest'
import { analyze } from './insights.js'
import type { BookSnapshot } from './snapshot.js'
import type { BookActivity, Engagement, PlayerActivity } from '../reporting/analytics.js'

const act = (o: Partial<BookActivity> = {}): BookActivity => ({
  bets: 0,
  turnover: 0,
  players: 0,
  playerNet: 0,
  houseGGR: 0,
  holdPct: 0,
  bonusCost: 0,
  houseNet: 0,
  ...o,
})
const eng = (o: Partial<Engagement> = {}): Engagement => ({
  active: 0,
  newPlayers: 0,
  returning: 0,
  dormant: 0,
  churned: 0,
  retentionPct: 0,
  windowDays: 7,
  ...o,
})
const pa = (accountId: string, turnover: number): PlayerActivity => ({
  accountId,
  bets: 1,
  turnover,
  net: 0,
  bonus: 0,
  firstActive: 0,
  lastActive: 0,
})
const snap = (o: Partial<BookSnapshot> = {}): BookSnapshot => ({
  now: 0,
  windowDays: 7,
  activity: act(),
  games: [],
  engagement: eng(),
  topPlayers: [],
  bookFigure: 0,
  creditUtilization: 0,
  players: 0,
  ...o,
})

const ids = (recs: { id: string }[]) => recs.map((r) => r.id)

describe('analyze — advisory recommendations', () => {
  it('flags high book exposure', () => {
    expect(ids(analyze(snap({ creditUtilization: 0.9, activity: act({ bets: 10 }) })))).toContain('exposure')
  })

  it('flags players net ahead only over a meaningful sample', () => {
    expect(ids(analyze(snap({ activity: act({ bets: 60, holdPct: -0.02, playerNet: 5000 }) })))).toContain('negative-hold')
    // a tiny sample of negative hold is just variance — not flagged
    expect(ids(analyze(snap({ activity: act({ bets: 5, holdPct: -0.4, playerNet: 200 }) })))).not.toContain('negative-hold')
  })

  it('flags single-player concentration', () => {
    const r = analyze(snap({ activity: act({ bets: 10, turnover: 1000 }), topPlayers: [pa('a', 600), pa('b', 400)] }))
    expect(ids(r)).toContain('concentration')
  })

  it('recommends re-engagement when retention is weak', () => {
    expect(ids(analyze(snap({ activity: act({ bets: 10 }), engagement: eng({ dormant: 3, retentionPct: 0.3 }) })))).toContain('reengage')
  })

  it('flags bonus spend outpacing revenue', () => {
    expect(ids(analyze(snap({ activity: act({ bets: 10, bonusCost: 5000, houseGGR: 1000 }) })))).toContain('bonus-roi')
  })

  it('notes a dead window', () => {
    expect(ids(analyze(snap()))).toEqual(['no-activity'])
  })

  it('says the book is healthy when nothing is flagged', () => {
    const r = analyze(
      snap({ activity: act({ bets: 100, turnover: 10000, holdPct: 0.01, houseGGR: 100 }), engagement: eng({ active: 5, retentionPct: 0.8 }) }),
    )
    expect(ids(r)).toEqual(['healthy'])
  })

  it('sorts high priority before lower', () => {
    const r = analyze(
      snap({
        creditUtilization: 0.95, // high
        activity: act({ bets: 10, bonusCost: 5000, houseGGR: 1000 }), // medium
      }),
    )
    expect(r[0].priority).toBe('high')
    expect(r[0].id).toBe('exposure')
  })

  it('is read-only — every result is plain advisory data with a suggested action', () => {
    for (const rec of analyze(snap({ creditUtilization: 0.9, activity: act({ bets: 10 }) }))) {
      expect(typeof rec.suggestedAction).toBe('string')
      expect(rec.suggestedAction.length).toBeGreaterThan(0)
    }
  })
})
