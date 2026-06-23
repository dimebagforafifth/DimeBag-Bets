/**
 * Default per-head billing config — the off-by-default arrangement.
 *
 * With these defaults a weekly bill is exactly `activeHeads × $5.00`: no tiers, no enabled
 * add-ons, no discount, no free weeks, not paused. A manager tunes the rate / tiers / add-ons
 * from the Billing & Invoices console tile. FIAT — never touches the credit core.
 */

import type { ActiveDefinition, BillingConfig } from './types.js'

/** Active = the player placed ≥1 settled wager through core that week (mode-agnostic). */
export const DEFAULT_ACTIVE_DEFINITION: ActiveDefinition = {
  kind: 'settled-wager',
  minSettledWagers: 1,
}

/** $5.00 / active head / week — the low end of the realistic $3–$10 per-head market. */
export const DEFAULT_BASE_RATE_CENTS = 500

export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  baseRateCentsPerHead: DEFAULT_BASE_RATE_CENTS,
  currency: 'USD',
  activeDefinition: { ...DEFAULT_ACTIVE_DEFINITION },
  tiers: [],
  addons: [
    // Shipped disabled — the operator opts in. Casino = $1/active head; live support = $50/wk flat.
    { key: 'casino', label: 'Casino games', perHeadCents: 100, flatCents: 0, enabled: false },
    {
      key: 'live-support',
      label: 'Live support',
      perHeadCents: 0,
      flatCents: 5_000,
      enabled: false,
    },
  ],
  freeWeeks: 0,
  seasonalPause: false,
  cryptoDiscountBps: 0,
}
