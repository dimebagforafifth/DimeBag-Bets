/** Per-head fee math (PURE, FIAT cents). Covers the brief's pricing cases:
 *  10 @ $5 → $50, 100 → $500 (tiered), volume tier, casino add-on, crypto discount,
 *  free-week → $0 waived, seasonal pause. */

import { describe, expect, it } from 'vitest'
import { DEFAULT_BILLING_CONFIG } from './config.js'
import { addonCentsFor, computeBill, rateForCount } from './fees.js'
import type { BillingConfig } from './types.js'

const cfg = (over: Partial<BillingConfig> = {}): BillingConfig => ({
  ...DEFAULT_BILLING_CONFIG,
  ...over,
})

describe('computeBill', () => {
  it('10 active heads at $5 → $50', () => {
    const b = computeBill(cfg(), { activeHeadCount: 10 })
    expect(b.baseCents).toBe(5_000)
    expect(b.totalCents).toBe(5_000) // $50.00
    expect(b.billedHeadCount).toBe(10)
    expect(b.status).toBe('draft')
  })

  it('100 active heads price to $500 under a tier schedule (still in the $5 band)', () => {
    const tiers = [
      { minHeads: 1, rateCentsPerHead: 500 },
      { minHeads: 201, rateCentsPerHead: 450 },
    ]
    const b = computeBill(cfg({ tiers }), { activeHeadCount: 100 })
    expect(b.totalCents).toBe(50_000) // $500.00
  })

  it('a volume tier lowers the per-head rate on the WHOLE bill above the threshold', () => {
    const tiers = [
      { minHeads: 1, rateCentsPerHead: 500 },
      { minHeads: 101, rateCentsPerHead: 450 },
    ]
    expect(rateForCount(cfg({ tiers }), 100)).toBe(500)
    expect(rateForCount(cfg({ tiers }), 200)).toBe(450)
    const b = computeBill(cfg({ tiers }), { activeHeadCount: 200 })
    expect(b.totalCents).toBe(90_000) // 200 × $4.50 = $900, not $1000
  })

  it('a casino add-on surcharges every active head', () => {
    const addons = [
      { key: 'casino', label: 'Casino', perHeadCents: 100, flatCents: 0, enabled: true },
    ]
    const b = computeBill(cfg({ addons }), { activeHeadCount: 10 })
    expect(b.baseCents).toBe(5_000)
    expect(b.addonCents).toBe(1_000) // 10 × $1
    expect(b.totalCents).toBe(6_000) // $60
  })

  it('a flat add-on adds a fixed weekly fee regardless of head count', () => {
    const addons = [
      { key: 'support', label: 'Support', perHeadCents: 0, flatCents: 5_000, enabled: true },
    ]
    const b = computeBill(cfg({ addons }), { activeHeadCount: 10 })
    expect(b.addonCents).toBe(5_000)
    expect(b.totalCents).toBe(10_000) // $50 base + $50 flat
  })

  it('a crypto discount comes off the subtotal in basis points', () => {
    const b = computeBill(cfg({ cryptoDiscountBps: 1_000 }), { activeHeadCount: 10 }) // 10%
    expect(b.discountCents).toBe(500)
    expect(b.totalCents).toBe(4_500) // $45
  })

  it('a free week waives the period to $0 and marks it waived', () => {
    const b = computeBill(cfg(), { activeHeadCount: 10, freeWeek: true })
    expect(b.totalCents).toBe(0)
    expect(b.billedHeadCount).toBe(0)
    expect(b.status).toBe('waived')
    expect(b.waivedReason).toBe('free-week')
  })

  it('a seasonal pause waives every period to $0', () => {
    const b = computeBill(cfg({ seasonalPause: true }), { activeHeadCount: 40 })
    expect(b.totalCents).toBe(0)
    expect(b.status).toBe('waived')
    expect(b.waivedReason).toBe('seasonal-pause')
  })

  it('discount and add-ons compose: ($50 base + $10 casino) − 10% = $54', () => {
    const b = computeBill(
      cfg({
        addons: [
          { key: 'casino', label: 'Casino', perHeadCents: 100, flatCents: 0, enabled: true },
        ],
        cryptoDiscountBps: 1_000,
      }),
      { activeHeadCount: 10 },
    )
    expect(b.baseCents).toBe(5_000)
    expect(b.addonCents).toBe(1_000)
    expect(b.discountCents).toBe(600) // 10% of $60
    expect(b.totalCents).toBe(5_400)
  })

  it('addonCentsFor ignores disabled add-ons (the shipped defaults bill base only)', () => {
    expect(addonCentsFor(cfg(), 10)).toBe(0)
  })
})
