/**
 * The configurable margin step. The headline guarantee: at 450 bps with no shade, the new
 * `applyMargin` reproduces the legacy house haircut EXACTLY (it reuses that math), so the
 * default pricing_config does not regress current pricing. Plus posture (sharp→recreational
 * widens the hold and shades the favorite) and the full devig→margin→hook pipeline.
 */
import { describe, it, expect } from 'vitest'
import {
  applyMargin as legacyHaircut,
  priceFromAmerican,
  impliedProbability,
  DEFAULT_MARGIN,
} from './pricing.js'
import { devig } from './devig.js'
import {
  applyMargin,
  priceMarket,
  bookHold,
  effectiveSettings,
  PRICING_POSTURE_PRESETS,
  type MarginSettings,
  type PricedOdd,
} from './pricing-engine.js'

const CFG: MarginSettings = { marginBps: 450, favoriteShadeBps: 0, devigMethod: 'power' }

describe('applyMargin reproduces current pricing at 450 bps', () => {
  it('450 bps == the legacy DEFAULT_MARGIN', () => {
    expect(DEFAULT_MARGIN).toBe(450 / 10_000)
  })

  it('matches the legacy haircut on each price, exactly', () => {
    for (const american of [-150, 130, -110, 250, -1000, 600]) {
      const rawProb = impliedProbability(american)
      const [priced] = applyMargin([rawProb], CFG, 'custom')
      const legacy = legacyHaircut(priceFromAmerican(american), 0.045)
      expect(priced.decimal).toBe(legacy.decimal)
      expect(priced.american).toBe(legacy.american)
    }
  })

  it('prices a full 2-way market identically to the legacy per-price haircut (no shade)', () => {
    const americans = [-150, 130]
    const priced = applyMargin(americans.map(impliedProbability), CFG, 'custom')
    priced.forEach((o, i) => {
      expect(o.decimal).toBe(legacyHaircut(priceFromAmerican(americans[i]), 0.045).decimal)
    })
  })
})

describe('posture: sharp → recreational widens the hold and shades the favorite', () => {
  const trueProbs = devig([impliedProbability(-150), impliedProbability(130)], 'power') // fair 2-way

  it('recreational holds more than sharp', () => {
    const sharp = applyMargin(trueProbs, CFG, 'sharp')
    const rec = applyMargin(trueProbs, CFG, 'recreational')
    expect(bookHold(rec)).toBeGreaterThan(bookHold(sharp))
  })

  it('recreational shades the favorite (extra margin on the short side); sharp does not', () => {
    const rec = applyMargin(trueProbs, CFG, 'recreational')
    const fav = rec.find((o: PricedOdd) => o.isFavorite)!
    const dog = rec.find((o: PricedOdd) => !o.isFavorite)!
    expect(fav.marginBps).toBeGreaterThan(dog.marginBps) // favorite shade applied

    const sharp = applyMargin(trueProbs, CFG, 'sharp')
    const sFav = sharp.find((o: PricedOdd) => o.isFavorite)!
    const sDog = sharp.find((o: PricedOdd) => !o.isFavorite)!
    expect(sFav.marginBps).toBe(sDog.marginBps) // sharp: no shade
  })

  it('effectiveSettings resolves a named posture to its preset', () => {
    expect(effectiveSettings(CFG, 'sharp')).toEqual(PRICING_POSTURE_PRESETS.sharp)
    expect(effectiveSettings(CFG, 'custom')).toEqual(CFG)
  })
})

describe('priceMarket pipeline (devig → applyMargin → hook)', () => {
  it('de-vigs then re-margins, producing a sane held market', () => {
    const priced = priceMarket([-150, 130], CFG)
    expect(priced).toHaveLength(2)
    expect(bookHold(priced)).toBeGreaterThan(0) // the book holds margin
    expect(priced.every((o) => o.decimal > 1)).toBe(true)
  })

  it('runs the post-margin hook (Lane B gate seam) after margin, before publish', () => {
    let sawCtx = ''
    const hook = (priced: PricedOdd[], ctx: { marketType?: string }): PricedOdd[] => {
      sawCtx = ctx.marketType ?? ''
      // simulate a suspension: blank the away price
      return priced.map((o, i) => (i === 1 ? { ...o, decimal: 0, american: 0 } : o))
    }
    const out = priceMarket([-150, 130], CFG, { hook, ctx: { marketType: 'moneyline' } })
    expect(sawCtx).toBe('moneyline')
    expect(out[1].decimal).toBe(0) // the gate rewrote the published price
  })
})
