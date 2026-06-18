/**
 * Configurable margin: the operator's hold posture (base + per-market overrides) is RESOLVED
 * per market and APPLIED through the same pricing pipeline. Proves the rate is now a setting,
 * a per-market override beats the base, the live store clamps + notifies, and the SGP path is
 * untouched (it just takes the resolved rate).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  resolveMargin,
  applyMargin,
  priceFromAmerican,
  DEFAULT_MARGIN,
  DEFAULT_MARGIN_CONFIG,
  MARGIN_POSTURES,
  buildRows,
  getMarginConfig,
  getMarginVersion,
  subscribeMargin,
  setBaseMargin,
  setMarketMargin,
  setMarginConfig,
  applyPosture,
  __resetMarginConfig,
  type NormalizedEvent,
} from './index.js'

beforeEach(() => __resetMarginConfig())

describe('resolveMargin', () => {
  it('falls back to the base when a market has no override', () => {
    expect(resolveMargin({ base: 0.05 }, 'moneyline')).toBe(0.05)
    expect(resolveMargin({ base: 0.05 })).toBe(0.05)
  })

  it('a per-market override beats the base', () => {
    const cfg = { base: 0.045, perMarket: { prop: 0.09 } }
    expect(resolveMargin(cfg, 'prop')).toBe(0.09)
    expect(resolveMargin(cfg, 'moneyline')).toBe(0.045) // unlisted → base
  })

  it('no config at all → the legacy DEFAULT_MARGIN, and rates clamp to [0, 0.5]', () => {
    expect(resolveMargin(undefined, 'total')).toBe(DEFAULT_MARGIN)
    expect(resolveMargin({ base: 5 }, 'total')).toBe(0.5) // clamped to the 50% ceiling
    expect(resolveMargin({ base: -1 }, 'total')).toBe(0)
  })

  it('the default config and BALANCED posture are byte-identical to the legacy flat margin', () => {
    expect(DEFAULT_MARGIN_CONFIG).toEqual({ base: DEFAULT_MARGIN })
    expect(MARGIN_POSTURES.balanced.base).toBe(DEFAULT_MARGIN)
    expect(resolveMargin(DEFAULT_MARGIN_CONFIG, 'prop')).toBe(DEFAULT_MARGIN)
  })
})

/** A two-market event: one moneyline, one player prop, both posting an even (+100) raw price. */
function evenEvent(): NormalizedEvent {
  const raw = priceFromAmerican(100) // decimal 2.0
  const sel = (id: string) => ({
    selectionId: id,
    side: id,
    priceRaw: raw,
    priceDisplay: raw,
    bookmaker: 'mock',
    available: true,
  })
  return {
    eventId: 'e1',
    leagueId: 'NBA',
    sport: 'BASKETBALL',
    home: 'LAL',
    away: 'BOS',
    startsAt: '2026-01-01T00:00:00Z',
    status: 'pre',
    markets: [
      {
        marketId: 'e1:moneyline:game',
        type: 'moneyline',
        period: 'game',
        selections: [sel('ml-h')],
      },
      {
        marketId: 'e1:prop:game',
        type: 'prop',
        period: 'game',
        statId: 'points',
        playerId: 'L. James',
        selections: [sel('pr-o')],
      },
    ],
  }
}

describe('configurable margin is APPLIED per market through buildRows', () => {
  it('a flat rate prices every market the same (legacy behaviour preserved)', () => {
    const rows = buildRows([evenEvent()], new Map(), 0.05, 'now')
    for (const s of rows.selections) {
      expect(s.price_display_decimal).toBe(applyMargin(priceFromAmerican(100), 0.05).decimal)
    }
  })

  it('a per-market override gives the prop fatter juice than the moneyline', () => {
    const config = { base: 0.05, perMarket: { prop: 0.1 as number } }
    const rows = buildRows([evenEvent()], new Map(), config, 'now')
    const ml = rows.selections.find((s) => s.selection_id === 'ml-h')!
    const prop = rows.selections.find((s) => s.selection_id === 'pr-o')!
    // moneyline 5% → 1.95 ; prop 10% → 1.90 (a shorter price = more hold)
    expect(ml.price_display_decimal).toBe(1.95)
    expect(prop.price_display_decimal).toBe(1.9)
    expect(prop.price_display_decimal).toBeLessThan(ml.price_display_decimal)
  })

  it('a manual override still wins — margin is skipped regardless of the config', () => {
    const overrides = new Map([['ml-h', priceFromAmerican(-200)]])
    const rows = buildRows([evenEvent()], overrides, { base: 0.2 }, 'now')
    const ml = rows.selections.find((s) => s.selection_id === 'ml-h')!
    expect(ml.override).toBe(true)
    expect(ml.price_display_american).toBe(-200)
  })
})

describe('the live margin store', () => {
  it('defaults to the byte-identical flat config', () => {
    expect(getMarginConfig()).toEqual({ base: DEFAULT_MARGIN })
  })

  it('setBaseMargin / setMarketMargin update + clamp, and clearing an override removes it', () => {
    setBaseMargin(0.06)
    expect(getMarginConfig().base).toBe(0.06)
    setMarketMargin('prop', 0.12)
    expect(getMarginConfig().perMarket?.prop).toBe(0.12)
    setMarketMargin('prop', 5) // clamps to the ceiling
    expect(getMarginConfig().perMarket?.prop).toBe(0.5)
    setMarketMargin('prop', null) // clear
    expect(getMarginConfig().perMarket?.prop).toBeUndefined()
  })

  it('applyPosture adopts a preset and notifies subscribers', () => {
    let hits = 0
    const unsub = subscribeMargin(() => hits++)
    const before = getMarginVersion()
    applyPosture('recreational')
    expect(getMarginConfig()).toEqual(MARGIN_POSTURES.recreational)
    expect(getMarginConfig().perMarket?.prop).toBeGreaterThan(getMarginConfig().base) // props fatter
    expect(getMarginVersion()).toBeGreaterThan(before)
    expect(hits).toBe(1)
    unsub()
    setBaseMargin(0.03)
    expect(hits).toBe(1) // unsubscribed — no more notifications
  })

  it('adopting a posture clones it — mutating the store never mutates the preset', () => {
    applyPosture('sharp')
    setMarketMargin('prop', 0.04)
    expect(MARGIN_POSTURES.sharp.perMarket?.prop).toBe(0.03) // preset intact
  })

  it('setMarginConfig drops an emptied per-market map', () => {
    setMarginConfig({ base: 0.05, perMarket: {} })
    expect(getMarginConfig().perMarket).toBeUndefined()
  })
})
