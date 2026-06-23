/**
 * Per-head billing — public surface (logic only).
 *
 * FIAT operator billing, strictly separate from the player credit core. The console tile
 * (manifest + panel) is imported directly by the wiring pass / shell from billing/manifest.ts
 * and billing/BillingPanel.tsx, so this barrel stays free of React/CSS for non-UI consumers.
 */

export type {
  Currency,
  ActiveDefinition,
  BillingTier,
  BillingAddon,
  BillingConfig,
  BillingStatus,
  HeadReason,
  BillingHeadSnapshot,
  BillingPeriod,
  BillingComputation,
} from './types.js'

export {
  DEFAULT_BILLING_CONFIG,
  DEFAULT_BASE_RATE_CENTS,
  DEFAULT_ACTIVE_DEFINITION,
} from './config.js'

export { rateForCount, addonCentsFor, computeBill, type ComputeInput } from './fees.js'

export {
  settledWagerCount,
  wasActiveInWeek,
  runHeadCountJob,
  bookLedgerActivityReader,
  type ActivityRecord,
  type ActivityReader,
  type HeadCountInput,
} from './job.js'

export {
  subscribeBilling,
  getBillingVersion,
  getBillingConfig,
  updateBillingConfig,
  listPeriods,
  getPeriod,
  previewPeriod,
  generatePeriod,
  setPeriodStatus,
  issuePeriod,
  markPeriodPaid,
  waivePeriod,
  __resetBilling,
  __seedBilling,
} from './store.js'

export { usd } from './format.js'

export { invoiceCsv, invoiceJson } from './export.js'
