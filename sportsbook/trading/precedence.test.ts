import { describe, it, expect, beforeEach } from 'vitest'
import {
  publishMarket,
  effectiveMargin,
  setHouseMargin,
  setLeagueMarketMargin,
  resetHouseMargin,
  houseMarginActive,
  recordPricingAudit,
  getPricingAudit,
  altLineLadderSpread,
  type PublishLayers,
} from './index.js'
import type { Selection } from '../markets.js'

const sel = (market: Selection['market'], pick: Selection['pick'], odds: number, line?: number): Selection => ({
  id: `e-${market}-${pick}`,
  eventId: 'e',
  market,
  pick,
  label: `${pick}`,
  odds,
  line,
})

const base = (over: Partial<PublishLayers>): PublishLayers => ({
  feed: [sel('moneyline', 'home', -110), sel('moneyline', 'away', -110)],
  market: 'moneyline',
  homeTeam: 'Lakers',
  awayTeam: 'Celtics',
  ...over,
})

beforeEach(() => resetHouseMargin())

describe('publishMarket — the precedence pipeline', () => {
  it('feed only: passes the raw price through, source = feed', () => {
    const out = publishMarket(base({}))
    expect(out.source).toBe('feed')
    expect(out.sels.map((s) => s.odds)).toEqual([-110, -110])
  })

  it('house/market margin reprices the juice, source = margin', () => {
    const out = publishMarket(base({ margin: 0.1 }))
    expect(out.source).toBe('margin')
    // a 10% market is wider than the ~4.5% feed: both prices get more negative
    expect(out.sels[0].odds).toBeLessThan(-110)
  })

  it('a line shift is an adjustment, source = adjustment', () => {
    const out = publishMarket(
      base({
        market: 'spread',
        feed: [sel('spread', 'home', -110, -3.5), sel('spread', 'away', -110, 3.5)],
        lineShift: -1,
      }),
    )
    expect(out.source).toBe('adjustment')
    expect(out.sels.find((s) => s.pick === 'home')?.line).toBe(-4.5)
  })

  it('OVERRIDE beats ADJUSTMENT beats MARGIN beats FEED (the precedence guarantee)', () => {
    // All four layers configured at once: margin + line shift + a manual override.
    const out = publishMarket(
      base({
        market: 'spread',
        feed: [sel('spread', 'home', -110, -3.5), sel('spread', 'away', -110, 3.5)],
        margin: 0.08,
        lineShift: -1,
        override: { odds: [-150, 130], line: -2.5 },
      }),
    )
    // the override wins outright — published number is the pinned one, not the computed one
    expect(out.source).toBe('override')
    expect(out.sels.find((s) => s.pick === 'home')?.odds).toBe(-150)
    expect(out.sels.find((s) => s.pick === 'away')?.odds).toBe(130)
    expect(out.sels.find((s) => s.pick === 'home')?.line).toBe(-2.5)
    // and it reports the drift vs the computed (feed→margin→shift) home price
    expect(typeof out.overrideDrift).toBe('number')
  })

  it('an override is NOT clobbered by a feed move — drift just changes', () => {
    const a = publishMarket(base({ override: { odds: [-120, 100] } }))
    // the feed price moves (−110 → −130) but the override stays pinned
    const b = publishMarket(base({ feed: [sel('moneyline', 'home', -130), sel('moneyline', 'away', 110)], override: { odds: [-120, 100] } }))
    expect(a.sels[0].odds).toBe(-120)
    expect(b.sels[0].odds).toBe(-120) // unchanged — override still wins
    expect(a.overrideDrift).not.toBe(b.overrideDrift) // but the drift reflects the feed move
  })
})

describe('effectiveMargin — margin precedence', () => {
  it('per-market beats league×market matrix beats global house beats feed', () => {
    expect(effectiveMargin('NBA', 'spread')).toEqual({ margin: null, source: 'feed' })
    setHouseMargin(0.045)
    expect(effectiveMargin('NBA', 'spread')).toEqual({ margin: 0.045, source: 'house' })
    setLeagueMarketMargin('NBA', 'spread', 0.06)
    expect(effectiveMargin('NBA', 'spread')).toEqual({ margin: 0.06, source: 'matrix' })
    // a per-event-market value (held by the overlay) beats everything
    expect(effectiveMargin('NBA', 'spread', 0.08)).toEqual({ margin: 0.08, source: 'market' })
    expect(houseMarginActive()).toBe(true)
  })
})

describe('pricing audit + alt lines', () => {
  it('recordPricingAudit appends newest-first with before→after detail', () => {
    const before = getPricingAudit().length
    recordPricingAudit({ action: 'margin', scope: 'nba-lal-bos|spread', detail: 'Margin feed → 4.5%' })
    const log = getPricingAudit()
    expect(log.length).toBe(before + 1)
    expect(log[0].detail).toContain('→')
    expect(log[0].actor).toBe('operator')
  })

  it('altLineLadderSpread derives a symmetric ladder around the main line', () => {
    const ladder = altLineLadderSpread(-3.5, 2)
    expect(ladder.map((r) => r.line)).toEqual([-4.5, -4.0, -3.5, -3.0, -2.5])
    for (const rung of ladder) expect(rung.odds).toHaveLength(2)
  })
})
