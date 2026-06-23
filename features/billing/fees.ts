/**
 * Per-head fee math — PURE. Nothing here moves money; a caller (the store / the job)
 * applies the result. All amounts are integer cents (FIAT US dollars).
 *
 * Pricing a period:
 *   base      = billedHeads × rate(for the head count under the volume schedule)
 *   add-ons   = Σ enabled add-ons (billedHeads × perHead + flat)
 *   subtotal  = base + add-ons
 *   discount  = round(subtotal × cryptoDiscountBps / 10_000)
 *   total     = subtotal − discount
 *
 * A seasonal pause or a free week WAIVES the period to $0 ('waived', billedHeads = 0).
 */

import type { BillingComputation, BillingConfig } from './types.js'

/**
 * The per-head rate (cents) for a given active head count under the config's volume
 * schedule: the highest tier whose `minHeads` the count reaches wins, applied to the whole
 * bill. With no tiers (or none reached) the flat `baseRateCentsPerHead` applies.
 */
export function rateForCount(config: BillingConfig, headCount: number): number {
  let rate = config.baseRateCentsPerHead
  let bestMin = -1
  for (const tier of config.tiers) {
    if (headCount >= tier.minHeads && tier.minHeads > bestMin) {
      rate = tier.rateCentsPerHead
      bestMin = tier.minHeads
    }
  }
  return rate
}

/** Total enabled add-on cents for `headCount` active heads (per-head surcharge + flat fee). */
export function addonCentsFor(config: BillingConfig, headCount: number): number {
  let cents = 0
  for (const a of config.addons) {
    if (!a.enabled) continue
    cents += headCount * a.perHeadCents + a.flatCents
  }
  return cents
}

export interface ComputeInput {
  activeHeadCount: number
  /** This billed period falls within the free-weeks allotment → waive to $0. */
  freeWeek?: boolean
}

/** Price one billing period. PURE — moves no money. */
export function computeBill(config: BillingConfig, input: ComputeInput): BillingComputation {
  const heads = Math.max(0, Math.trunc(input.activeHeadCount))

  if (config.seasonalPause || input.freeWeek) {
    return {
      billedHeadCount: 0,
      baseCents: 0,
      addonCents: 0,
      discountCents: 0,
      totalCents: 0,
      status: 'waived',
      waivedReason: config.seasonalPause ? 'seasonal-pause' : 'free-week',
    }
  }

  const baseCents = heads * rateForCount(config, heads)
  const addonCents = addonCentsFor(config, heads)
  const subtotal = baseCents + addonCents
  const discountCents = Math.round((subtotal * clampBps(config.cryptoDiscountBps)) / 10_000)
  const totalCents = subtotal - discountCents

  return {
    billedHeadCount: heads,
    baseCents,
    addonCents,
    discountCents,
    totalCents,
    status: 'draft',
  }
}

function clampBps(bps: number): number {
  if (!Number.isFinite(bps)) return 0
  return Math.min(10_000, Math.max(0, Math.trunc(bps)))
}
