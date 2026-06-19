/**
 * Trading Desk — public surface (Round 2, Lane B). The operator's post-pipeline controls:
 * line overrides, stake/payout limits, market suspensions, and the pricing-config rows the desk
 * writes back to Lane A's pipeline. The GATE (applyOverrides / gateWager) sits after Lane A's
 * devig → applyMargin and before publish / placement. Credits-only; money only through `core`.
 */

export type {
  LineOverride,
  MarketLimit,
  MarketSuspension,
  PricingConfigRow,
  TradingScope,
  TimeToEventTier,
  MarginPosture,
  DevigMethod,
} from './types.js'

// Overrides
export {
  getOverrides,
  setOverride,
  clearOverride,
  liveOverrideFor,
  isOverrideLive,
  subscribeOverrides,
  overridesVersion,
  __resetOverrides,
  type SetOverrideInput,
} from './overrides.js'

// Limits
export {
  getLimits,
  setLimit,
  removeLimit,
  resolveLimit,
  subscribeLimits,
  limitsVersion,
  __resetLimits,
  type LimitContext,
  type SetLimitInput,
} from './limits.js'

// Suspensions (shared flag with the risk system)
export {
  suspend,
  unsuspend,
  isSuspended,
  listSuspensions,
  subscribeSuspensions,
  __resetSuspensionMeta,
} from './suspensions.js'

// Pricing config (Lane A interface)
export {
  globalRow,
  rowFor,
  allRows,
  effectiveConfig,
  devigMethodFor,
  postureFor,
  marginFloor,
  setMargin,
  setMarginFloor,
  setPosture,
  setDevigMethod,
  subscribePricingConfig,
  pricingConfigVersion,
  __resetPricingConfig,
} from './pricing-config.js'

// The gate (post-pipeline hook) + hold readout
export { applyOverrides, gateWager, type GateLeg, type GateWagerInput } from './gate.js'
export { marketHold, type MarketHold, type SelectionHold } from './hold.js'

// Demo seed
export { seedTradingDesk, __resetTrading } from './seed.js'

// The console tile descriptor (// SEAM — wiring mounts it).
export { tradingDeskManifest } from './trading-desk-tile.js'
