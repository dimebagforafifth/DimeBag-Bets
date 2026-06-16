import { describe, it, expect } from 'vitest'
import type { Price } from './contract.js'
import {
  decimalFromAmerican,
  americanFromDecimal,
  priceFromAmerican,
  priceFromDecimal,
  applyMargin,
  applyPricing,
  makeOverride,
  DEFAULT_MARGIN,
} from './pricing.js'

/* ------------------------------------------------------------------ *
 * decimalFromAmerican / americanFromDecimal — conversions & branches
 * ------------------------------------------------------------------ */

describe('decimalFromAmerican', () => {
  it('converts a positive (underdog) American price to a total-return multiplier', () => {
    // +150 → stake back + 1.5× profit = 2.5 total return
    expect(decimalFromAmerican(150)).toBe(2.5)
  })

  it('converts a negative (favourite) American price', () => {
    // -110 → 1 + 100/110
    expect(decimalFromAmerican(-110)).toBeCloseTo(1.90909, 5)
  })

  it('maps the +100/-100 evens boundary to exactly 2.0', () => {
    expect(decimalFromAmerican(100)).toBe(2)
    expect(decimalFromAmerican(-100)).toBe(2)
  })

  it('treats 0 / invalid as no payout (decimal 1.0)', () => {
    expect(decimalFromAmerican(0)).toBe(1)
  })
})

describe('americanFromDecimal', () => {
  it('uses the >=2 (underdog) branch', () => {
    // decimal 2.5 is >= 2 → (2.5 - 1) * 100 = +150
    expect(americanFromDecimal(2.5)).toBe(150)
  })

  it('uses the <2 (favourite) branch', () => {
    // decimal ~1.9091 is < 2 → -100/(d-1) ≈ -110
    expect(americanFromDecimal(decimalFromAmerican(-110))).toBe(-110)
  })

  it('returns exactly +100 at the evens boundary (decimal 2.0, >=2 branch)', () => {
    expect(americanFromDecimal(2)).toBe(100)
  })

  it('returns 0 (no payout) for decimal <= 1', () => {
    expect(americanFromDecimal(1)).toBe(0)
    expect(americanFromDecimal(0.5)).toBe(0)
    expect(americanFromDecimal(0)).toBe(0)
  })

  it('rounds to a whole American price', () => {
    // decimal 1.4 → -100/0.4 = -250 exactly
    expect(americanFromDecimal(1.4)).toBe(-250)
    // decimal 3.5 → (3.5-1)*100 = +250
    expect(americanFromDecimal(3.5)).toBe(250)
  })
})

describe('round-trips American → decimal → American', () => {
  it('+150 round-trips (underdog / decimal >= 2 branch)', () => {
    expect(americanFromDecimal(decimalFromAmerican(150))).toBe(150)
  })

  it('-110 round-trips (favourite / decimal < 2 branch)', () => {
    expect(americanFromDecimal(decimalFromAmerican(-110))).toBe(-110)
  })

  it('+100 round-trips at the evens boundary', () => {
    expect(americanFromDecimal(decimalFromAmerican(100))).toBe(100)
  })

  it('-100 collapses onto +100 (both are decimal 2.0 — the documented evens boundary)', () => {
    // -100 and +100 are the same price (decimal 2.0); americanFromDecimal canonicalises
    // the evens boundary to the positive notation.
    expect(decimalFromAmerican(-100)).toBe(decimalFromAmerican(100))
    expect(americanFromDecimal(decimalFromAmerican(-100))).toBe(100)
  })

  it('round-trips a spread of favourite prices through the <2 branch', () => {
    for (const a of [-110, -120, -150, -200, -250, -300]) {
      expect(americanFromDecimal(decimalFromAmerican(a))).toBe(a)
    }
  })

  it('round-trips a spread of underdog prices through the >=2 branch', () => {
    for (const a of [110, 150, 200, 250, 350, 500]) {
      expect(americanFromDecimal(decimalFromAmerican(a))).toBe(a)
    }
  })
})

/* ------------------------------------------------------------------ *
 * priceFromAmerican / priceFromDecimal — both notations filled
 * ------------------------------------------------------------------ */

describe('priceFromAmerican', () => {
  it('fills both notations from an American price (underdog)', () => {
    const p = priceFromAmerican(150)
    expect(p).toEqual<Price>({ american: 150, decimal: 2.5 })
  })

  it('fills both notations from an American price (favourite, decimal rounded to 4dp)', () => {
    const p = priceFromAmerican(-110)
    expect(p.american).toBe(-110)
    expect(p.decimal).toBe(1.9091)
  })

  it('fills both notations at the evens boundary', () => {
    expect(priceFromAmerican(100)).toEqual<Price>({ american: 100, decimal: 2 })
    // -100 keeps its requested American notation; decimal is still 2.0
    expect(priceFromAmerican(-100)).toEqual<Price>({ american: -100, decimal: 2 })
  })
})

describe('priceFromDecimal', () => {
  it('fills both notations from a decimal (underdog / >=2 branch)', () => {
    expect(priceFromDecimal(2.5)).toEqual<Price>({ american: 150, decimal: 2.5 })
  })

  it('fills both notations from a decimal (favourite / <2 branch)', () => {
    const p = priceFromDecimal(1.9091)
    expect(p.american).toBe(-110)
    expect(p.decimal).toBe(1.9091)
  })

  it('rounds the decimal to 4dp', () => {
    const p = priceFromDecimal(1.909090909)
    expect(p.decimal).toBe(1.9091)
  })
})

describe('makeOverride', () => {
  it('is a full Price built from an operator American input', () => {
    expect(makeOverride(150)).toEqual<Price>({ american: 150, decimal: 2.5 })
    expect(makeOverride(-110)).toEqual(priceFromAmerican(-110))
  })
})

/* ------------------------------------------------------------------ *
 * applyMargin — display = 1 + (rawDecimal - 1) * (1 - margin)
 * ------------------------------------------------------------------ */

describe('applyMargin', () => {
  const raw = priceFromAmerican(150) // decimal 2.5

  it('shortens the price by the formula: display = 1 + (raw.decimal - 1)*(1 - margin)', () => {
    const margined = applyMargin(raw, 0.1)
    // 1 + (2.5 - 1) * 0.9 = 2.35
    expect(margined.decimal).toBe(2.35)
  })

  it('uses DEFAULT_MARGIN when none is supplied', () => {
    const margined = applyMargin(raw)
    const expectedDecimal = 1 + (raw.decimal - 1) * (1 - DEFAULT_MARGIN)
    expect(margined.decimal).toBe(round4(expectedDecimal))
    // sanity: the margined display is shorter than the raw price
    expect(margined.decimal).toBeLessThan(raw.decimal)
  })

  it('is monotonic — more margin = a shorter (smaller decimal) price', () => {
    const m0 = applyMargin(raw, 0).decimal
    const m05 = applyMargin(raw, 0.05).decimal
    const m10 = applyMargin(raw, 0.1).decimal
    const m20 = applyMargin(raw, 0.2).decimal
    expect(m0).toBeGreaterThan(m05)
    expect(m05).toBeGreaterThan(m10)
    expect(m10).toBeGreaterThan(m20)
  })

  it('with margin 0 returns the raw decimal unchanged', () => {
    expect(applyMargin(raw, 0).decimal).toBe(raw.decimal)
  })

  it('never pays below even money (decimal >= 1) even at max margin on a short price', () => {
    const shortRaw = priceFromAmerican(-100000) // decimal ≈ 1.001
    const margined = applyMargin(shortRaw, 0.5)
    expect(margined.decimal).toBeGreaterThanOrEqual(1)
  })

  it('clamps margin above the [0,0.5] range down to 0.5', () => {
    const clamped = applyMargin(raw, 0.9)
    const atMax = applyMargin(raw, 0.5)
    expect(clamped.decimal).toBe(atMax.decimal)
    // 1 + (2.5 - 1) * 0.5 = 1.75
    expect(clamped.decimal).toBe(1.75)
  })

  it('clamps margin below the [0,0.5] range up to 0', () => {
    const clamped = applyMargin(raw, -1)
    const atZero = applyMargin(raw, 0)
    expect(clamped.decimal).toBe(atZero.decimal)
    expect(clamped.decimal).toBe(raw.decimal)
  })

  it('is sign-agnostic — works on a favourite (negative American) raw price too', () => {
    const fav = priceFromAmerican(-200) // decimal 1.5
    const margined = applyMargin(fav, 0.1)
    // 1 + (1.5 - 1) * 0.9 = 1.45
    expect(margined.decimal).toBe(1.45)
    expect(margined.decimal).toBeLessThan(fav.decimal)
  })
})

/* ------------------------------------------------------------------ *
 * applyPricing — the full pipeline (margin vs. override-wins)
 * ------------------------------------------------------------------ */

describe('applyPricing — no override', () => {
  it('priceDisplay is the margined raw price and override is false', () => {
    const raw = priceFromAmerican(150)
    const priced = applyPricing(raw, { margin: 0.1 })
    expect(priced.override).toBe(false)
    expect(priced.priceDisplay).toEqual(applyMargin(raw, 0.1))
    expect(priced.priceRaw).toEqual(raw)
  })

  it('applies DEFAULT_MARGIN when no margin option is given', () => {
    const raw = priceFromAmerican(150)
    const priced = applyPricing(raw)
    expect(priced.override).toBe(false)
    expect(priced.priceDisplay).toEqual(applyMargin(raw))
  })

  it('a null override is treated as no override (margin applied)', () => {
    const raw = priceFromAmerican(150)
    const priced = applyPricing(raw, { override: null, margin: 0.1 })
    expect(priced.override).toBe(false)
    expect(priced.priceDisplay).toEqual(applyMargin(raw, 0.1))
  })

  it('preserves the raw price verbatim (display margined, raw untouched)', () => {
    const raw = priceFromAmerican(-110)
    const priced = applyPricing(raw)
    expect(priced.priceRaw.american).toBe(-110)
    expect(priced.priceRaw.decimal).toBe(1.9091)
    // display is shorter than raw
    expect(priced.priceDisplay.decimal).toBeLessThan(priced.priceRaw.decimal)
  })
})

describe('applyPricing — override wins', () => {
  it('priceDisplay equals the override verbatim and override is true', () => {
    const raw = priceFromAmerican(150) // decimal 2.5
    const override = makeOverride(-130)
    const priced = applyPricing(raw, { override })
    expect(priced.override).toBe(true)
    expect(priced.priceDisplay).toEqual(override)
  })

  it('SKIPS the margin entirely when an override is present', () => {
    const raw = priceFromAmerican(150)
    const override = makeOverride(150) // same American as raw, so margin would have shortened it
    const priced = applyPricing(raw, { override, margin: 0.2 })
    // margin would have produced 1 + (2.5-1)*0.8 = 2.2; override keeps the full 2.5
    expect(priced.priceDisplay.decimal).toBe(2.5)
    expect(priced.priceDisplay).not.toEqual(applyMargin(raw, 0.2))
  })

  it('the override-wins invariant: priceRaw still equals the fresh raw (override never touches raw)', () => {
    const raw = priceFromAmerican(250) // decimal 3.5
    const override = makeOverride(-150)
    const priced = applyPricing(raw, { override, margin: 0.045 })
    // override controls the display...
    expect(priced.priceDisplay).toEqual(override)
    expect(priced.override).toBe(true)
    // ...but the raw price refreshes underneath, untouched by the override
    expect(priced.priceRaw).toEqual(raw)
    expect(priced.priceRaw.american).toBe(250)
    expect(priced.priceRaw.decimal).toBe(3.5)
  })

  it('returns a copy of the override (mutating the result does not alter the source)', () => {
    const raw = priceFromAmerican(150)
    const override = makeOverride(-130)
    const priced = applyPricing(raw, { override })
    priced.priceDisplay.american = 999
    expect(override.american).toBe(-130)
  })

  it('rounds the raw decimal into priceRaw (4dp), matching the contract row precision', () => {
    const raw: Price = { american: -110, decimal: 1.909090909 }
    const priced = applyPricing(raw, { margin: 0.045 })
    expect(priced.priceRaw.decimal).toBe(1.9091)
    expect(priced.priceRaw.american).toBe(-110)
  })
})

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4
}
