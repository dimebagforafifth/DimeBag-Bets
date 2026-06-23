/**
 * Per-head billing — the FIAT (real-money) types.
 *
 * This is the OPERATOR's software cost: the platform charges the Manager (org/types.ts:6 —
 * "the customer we sell the software to") a weekly fee per ACTIVE player in their downline.
 *
 * STRICTLY SEPARATE FROM THE CREDIT CORE. Player points are a closed loop with no monetary
 * value (CLAUDE.md §1). These amounts are real US dollars, in integer cents, and live ONLY
 * in the billing tables — never in `accounts.balance`, never in the wager ledger, and never
 * routed through any `core` money function. The billing module imports NOTHING from `core/`.
 *
 * All cents are integers (games/shared/money.ts convention); never floats.
 */

/** Per-head billing is invoiced in real US dollars. */
export type Currency = 'USD'

/**
 * How an "active" (billable) head is defined. Configurable; the default — and only kind
 * shipped — is "placed at least `minSettledWagers` SETTLED wagers through core this week."
 *
 * MODE-AGNOSTIC by construction: a settled wager is a graded bet (any outcome) recorded
 * identically whether the org runs the credit (PPH) or balance (wallet) economy — economy
 * mode only changes `availableToWager` at placement and the weekly square-up, never how an
 * individual settled wager is recorded. See billing/job.ts.
 */
export interface ActiveDefinition {
  kind: 'settled-wager'
  /** Minimum settled wagers in the week to count as a billable head (default 1). */
  minSettledWagers: number
}

/**
 * A volume bracket. The whole bill is priced at the rate of the highest tier whose
 * `minHeads` the active head count reaches — i.e. more heads → a lower per-head rate
 * applied to every head (a standard per-head volume discount). An empty tier list means
 * the flat `baseRateCentsPerHead` applies at every count.
 */
export interface BillingTier {
  minHeads: number
  rateCentsPerHead: number
}

/**
 * An optional surcharge the operator can switch on (e.g. casino games, live support).
 * When enabled it adds `perHeadCents` for every active head plus a flat weekly `flatCents`.
 */
export interface BillingAddon {
  key: string
  label: string
  perHeadCents: number
  flatCents: number
  enabled: boolean
}

/**
 * billing_config — the operator's per-head arrangement. Persisted (FIAT), manager-set.
 * Off-by-default posture: with the shipped defaults a bill is just `activeHeads × base rate`,
 * no add-ons, no discount, no free weeks — and the whole module is inert until a manager
 * generates an invoice.
 */
export interface BillingConfig {
  /** Base per-head, per-week fee in cents — e.g. 500 = $5.00. The market is ~$3–$10/head. */
  baseRateCentsPerHead: number
  currency: Currency
  activeDefinition: ActiveDefinition
  /** Volume schedule; empty = flat base rate. */
  tiers: BillingTier[]
  addons: BillingAddon[]
  /** The first N billed periods are waived to $0 (new-operator onboarding). */
  freeWeeks: number
  /** Off-season pause — every period waives to $0 while true. */
  seasonalPause: boolean
  /** Standing discount (basis points, 0–10000) applied to the subtotal — e.g. pay-in-crypto. */
  cryptoDiscountBps: number
}

/** Lifecycle of one weekly invoice. */
export type BillingStatus = 'draft' | 'issued' | 'paid' | 'waived'

/** Why a head was (or was not) billed in a period. */
export type HeadReason = 'settled-wager' | 'no-activity' | 'inactive'

/**
 * billing_head_snapshot — one player's billable state captured at run time, so an invoice
 * is auditable head-by-head. Holds NO money (the per-head fee is derived from the count).
 */
export interface BillingHeadSnapshot {
  playerId: string
  playerName: string
  /** The owning agent/sub-agent (org agentOf), or null when the player sits under the manager. */
  agentId: string | null
  /** The owning agent's display name (denormalized for the invoice view), or null. */
  agentName: string | null
  active: boolean
  reason: HeadReason
}

/**
 * billing_period — one week's invoice for one tenant. FIAT cents; NOT credits, NOT the ledger.
 * `activeHeadCount` is the real count of billable heads; `billedHeadCount` is how many were
 * actually charged (0 on a waived week).
 */
export interface BillingPeriod {
  id: string
  tenantId: string
  weekStart: number
  weekEnd: number
  activeHeadCount: number
  billedHeadCount: number
  baseCents: number
  addonCents: number
  discountCents: number
  totalCents: number
  currency: Currency
  status: BillingStatus
  /** Set when the period was waived: which rule waived it (drives free-week accounting). */
  waivedReason?: 'seasonal-pause' | 'free-week'
  /**
   * False when the activity source could not be guaranteed to cover the whole week (e.g. the
   * capped per-tab book-ledger evicted older entries) — the active count may be UNDER-stated, so
   * the invoice could be low. A production server `transactions` reader sets this true. Surfaced
   * in the UI so a real invoice is never silently issued off an incomplete read.
   */
  coverageComplete: boolean
  /** A demo/sample invoice (auto-seeded for the panel), never a real billed week. */
  seeded?: boolean
  /** Per-head breakdown captured when the job ran (empty on seeded historical invoices). */
  snapshots: BillingHeadSnapshot[]
  createdAt: number
  issuedAt?: number
  paidAt?: number
}

/** The pure money result of pricing one period — no head identities. */
export interface BillingComputation {
  billedHeadCount: number
  baseCents: number
  addonCents: number
  discountCents: number
  totalCents: number
  status: BillingStatus
  /** Set when `status === 'waived'`: 'seasonal-pause' | 'free-week'. */
  waivedReason?: 'seasonal-pause' | 'free-week'
}
