/**
 * pricing_config — the operator's de-vig/margin settings as data, resolved most-specific-first
 * (market → sport → global) and seeded with a single 450-bps global row so a fresh book
 * reproduces today's pricing.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_PRICING_ROW,
  getPricingRows,
  resolvePricingConfig,
  resolveMarginSettings,
  upsertPricingRow,
  removePricingRow,
  applyPosturePreset,
  setPosture,
  toMarginSettings,
  globalRow,
  marginFloor,
  setMarginFloor,
  setMargin,
  setDevigMethod,
  DEFAULT_MARGIN_FLOOR_BPS,
  __resetPricingConfig,
  type PricingConfigRow,
} from './pricing-config.js'
import { PRICING_POSTURE_PRESETS } from './pricing-engine.js'

beforeEach(() => __resetPricingConfig())

describe('defaults reproduce today', () => {
  it('seeds exactly one global row at 450 bps / power', () => {
    const rows = getPricingRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(DEFAULT_PRICING_ROW)
    expect(DEFAULT_PRICING_ROW.marginBps).toBe(450)
    expect(resolveMarginSettings()).toEqual({ marginBps: 450, favoriteShadeBps: 0, devigMethod: 'power' })
  })
})

describe('resolution — most specific wins', () => {
  it('market beats sport beats global', () => {
    const sport: PricingConfigRow = { scope: 'sport', sportId: 'BASKETBALL', devigMethod: 'power', marginBps: 300, posture: 'sharp', favoriteShadeBps: 0 }
    const market: PricingConfigRow = { scope: 'market', sportId: 'BASKETBALL', marketType: 'prop', devigMethod: 'power', marginBps: 800, posture: 'recreational', favoriteShadeBps: 100 }
    upsertPricingRow(sport)
    upsertPricingRow(market)

    expect(resolvePricingConfig().marginBps).toBe(450) // nothing specific → global
    expect(resolvePricingConfig('BASKETBALL').marginBps).toBe(300) // sport row
    expect(resolvePricingConfig('BASKETBALL', 'moneyline').marginBps).toBe(300) // sport (no ml market row)
    expect(resolvePricingConfig('BASKETBALL', 'prop').marginBps).toBe(800) // market row
    expect(resolvePricingConfig('FOOTBALL').marginBps).toBe(450) // other sport → global
  })

  it('upsert replaces a row in place (keyed by scope+sport+market)', () => {
    const row: PricingConfigRow = { scope: 'sport', sportId: 'SOCCER', devigMethod: 'shin', marginBps: 500, posture: 'custom', favoriteShadeBps: 0 }
    upsertPricingRow(row)
    upsertPricingRow({ ...row, marginBps: 650 })
    expect(getPricingRows().filter((r) => r.scope === 'sport' && r.sportId === 'SOCCER')).toHaveLength(1)
    expect(resolvePricingConfig('SOCCER').marginBps).toBe(650)
  })

  it('the global row cannot be removed (the book floor)', () => {
    removePricingRow('global')
    expect(getPricingRows().some((r) => r.scope === 'global')).toBe(true)
  })
})

describe('posture presets', () => {
  it('applyPosturePreset stamps the preset margin + label', () => {
    const stamped = applyPosturePreset(DEFAULT_PRICING_ROW, 'sharp')
    expect(stamped.posture).toBe('sharp')
    expect(stamped.marginBps).toBe(PRICING_POSTURE_PRESETS.sharp.marginBps)
    expect(stamped.favoriteShadeBps).toBe(PRICING_POSTURE_PRESETS.sharp.favoriteShadeBps)
  })

  it('setPosture writes the preset onto a scoped row', () => {
    setPosture('recreational', 'sport', 'FOOTBALL')
    const row = resolvePricingConfig('FOOTBALL')
    expect(row.posture).toBe('recreational')
    expect(row.marginBps).toBe(PRICING_POSTURE_PRESETS.recreational.marginBps)
    expect(toMarginSettings(row).favoriteShadeBps).toBe(PRICING_POSTURE_PRESETS.recreational.favoriteShadeBps)
  })

  it("the 'balanced' posture (carried from Lane B) sits at today's 450 bps, no shade", () => {
    expect(PRICING_POSTURE_PRESETS.balanced).toEqual({ marginBps: 450, favoriteShadeBps: 0, devigMethod: 'power' })
    const stamped = applyPosturePreset(DEFAULT_PRICING_ROW, 'balanced')
    expect(stamped.posture).toBe('balanced')
    expect(stamped.marginBps).toBe(450)
  })
})

describe('governance — manager margin floor + agent clamp (collapsed from Lane B)', () => {
  it('defaults the floor to 200 bps on the global row', () => {
    expect(marginFloor()).toBe(DEFAULT_MARGIN_FLOOR_BPS)
    expect(globalRow().marginFloorBps).toBe(200)
  })

  it('an AGENT cannot set a margin below the floor (clamped up)', () => {
    setMarginFloor(300)
    setMargin(100, 'global', undefined, undefined, { asAgent: true }) // tries below the 300 floor
    expect(resolvePricingConfig().marginBps).toBe(300) // clamped up to the floor
  })

  it('an agent clamp applies on any scope (sport/market), not just global', () => {
    setMarginFloor(400)
    setMargin(150, 'sport', 'BASKETBALL', undefined, { asAgent: true })
    expect(resolvePricingConfig('BASKETBALL').marginBps).toBe(400) // clamped to global floor
  })

  it('the MANAGER may set below the floor and may lower the floor', () => {
    setMarginFloor(300)
    setMargin(120, 'global') // manager (no asAgent) — allowed below floor
    expect(resolvePricingConfig().marginBps).toBe(120)
    setMarginFloor(50) // manager lowers the floor
    expect(marginFloor()).toBe(50)
    setMargin(80, 'global', undefined, undefined, { asAgent: true }) // agent now allowed down to 50→80 ok
    expect(resolvePricingConfig().marginBps).toBe(80)
  })

  it('a non-finite (NaN) agent margin cannot bypass the floor (resolves to the floor)', () => {
    setMarginFloor(300)
    setMargin(Number.NaN, 'global', undefined, undefined, { asAgent: true })
    const bps = resolvePricingConfig().marginBps
    expect(Number.isFinite(bps)).toBe(true)
    expect(bps).toBe(300)
  })

  it('a manual setMargin makes the row custom and is bounded to [0,5000]', () => {
    setMargin(99999, 'global')
    expect(resolvePricingConfig().marginBps).toBe(5000)
    expect(resolvePricingConfig().posture).toBe('custom')
  })

  it('setDevigMethod changes only the method, leaving margin/posture', () => {
    setDevigMethod('shin', 'sport', 'SOCCER')
    const row = resolvePricingConfig('SOCCER')
    expect(row.devigMethod).toBe('shin')
    expect(row.marginBps).toBe(450) // inherited the default knobs, margin untouched
  })
})
