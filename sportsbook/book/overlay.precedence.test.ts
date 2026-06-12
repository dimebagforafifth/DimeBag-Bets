import { describe, it, expect, beforeEach } from 'vitest'
import {
  EVENTS,
  applyOverlay,
  setHouseMargin,
  setMargin,
  setLineOverride,
  setLeagueSuspended,
  resetOverlay,
  resetHouseMargin,
  getPricingAudit,
  type GameEvent,
} from '../index.js'

const byId = (events: GameEvent[], id: string) => events.find((e) => e.id === id)!
const spreadOdds = (e: GameEvent) => e.selections.filter((s) => s.market === 'spread').map((s) => s.odds)

beforeEach(() => {
  resetOverlay()
  resetHouseMargin()
})

describe('overlay → precedence pipeline integration', () => {
  it('a global house margin reprices every upcoming market', () => {
    const feed = byId(EVENTS, 'nba-lal-bos')
    const feedSpread = spreadOdds(feed)
    setHouseMargin(0.1) // a wide 10% book
    const after = byId(applyOverlay(EVENTS), 'nba-lal-bos')
    expect(spreadOdds(after)).not.toEqual(feedSpread) // repriced off the feed
  })

  it('a manual override wins over the house margin and is not clobbered', () => {
    setHouseMargin(0.06)
    setLineOverride('nba-lal-bos', 'spread', { odds: [-150, 130] })
    const e = byId(applyOverlay(EVENTS), 'nba-lal-bos')
    const home = e.selections.find((s) => s.market === 'spread' && s.pick === 'home')!
    const away = e.selections.find((s) => s.market === 'spread' && s.pick === 'away')!
    expect(home.odds).toBe(-150) // the pinned number, not the 6%-margin computed one
    expect(away.odds).toBe(130)
  })

  it('suspending a league closes every market in it (the flag the store reads)', () => {
    setLeagueSuspended('NBA', true)
    const slate = applyOverlay(EVENTS)
    const nba = slate.filter((e) => e.league === 'NBA')
    const other = slate.filter((e) => e.league !== 'NBA')
    expect(nba.length).toBeGreaterThan(0)
    expect(nba.every((e) => e.selections.every((s) => s.suspended))).toBe(true)
    expect(other.some((e) => e.selections.some((s) => s.suspended))).toBe(false)
  })

  it('every adjustment writes an audit entry (who / what / before→after)', () => {
    const before = getPricingAudit().length
    setMargin('nba-lal-bos', 'spread', 0.05)
    setLineOverride('nba-lal-bos', 'total', { line: 222.5 })
    setLeagueSuspended('NFL', true)
    const log = getPricingAudit()
    expect(log.length).toBe(before + 3)
    expect(log[0].actor).toBe('operator')
    expect(log.some((e) => e.action === 'margin' && /→/.test(e.detail))).toBe(true)
    expect(log.some((e) => e.action === 'override')).toBe(true)
    expect(log.some((e) => e.action === 'suspend')).toBe(true)
  })
})
