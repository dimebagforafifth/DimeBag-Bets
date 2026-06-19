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
})
