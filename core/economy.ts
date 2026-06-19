/**
 * Economy mode — the tenant-level money-model switch (CLAUDE.md §3).
 *
 * The platform runs in one of two economies, set by the manager and inherited by the whole
 * book:
 *   - 'credit'  — the PPH model: a credit line, a weekly figure that can run negative down to
 *                 the limit, squared up and reset each week. THIS IS THE DEFAULT.
 *   - 'balance' — a non-negative wallet wagered down (still no real money, no cash-out): no
 *                 credit line, no weekly collect, balances persist continuously.
 *
 * This is the lowest-layer seam: `availableToWager` (and so `placeWager`/`maxBet`) consult
 * `getEconomyMode()`, and the org settlement + the app's audit envelope read it too. It holds
 * only POLICY (mode + floor) as plain module state — no store, no tenant/persistence import —
 * so core stays the base layer. The app layer owns the persisted per-tenant config and pushes
 * the active tenant's policy in via `setEconomyPolicy`.
 *
 * OFF-BY-DEFAULT INVARIANT: with nothing set, every tenant resolves to credit / floor 0, so
 * `availableToWager` returns `creditLimit + balance − pending` exactly as before — byte-for-
 * byte-identical behaviour until an operator explicitly flips a book to balance mode.
 */

export type EconomyMode = 'credit' | 'balance'

export interface EconomyPolicy {
  mode: EconomyMode
  /** Balance mode only: the lowest a balance may be driven, in cents. Default 0 = a wallet
   *  that can never go negative. (A manager could set a small negative float, but never a
   *  credit line — that's what 'credit' mode is for.) */
  balanceFloorCents: number
}

/** The policy a tenant has until the operator sets one — the current PPH behaviour. */
export const DEFAULT_ECONOMY_POLICY: EconomyPolicy = { mode: 'credit', balanceFloorCents: 0 }

const DEFAULT_TENANT = 'default'
let activeTenant = DEFAULT_TENANT
const byTenant = new Map<string, EconomyPolicy>()

/** Point the core at the active book's tenant (a boot step, mirrors persistence/tenant). */
export function setActiveEconomyTenant(id: string | null | undefined): void {
  activeTenant = id && id.length > 0 ? id : DEFAULT_TENANT
}
export function getActiveEconomyTenant(): string {
  return activeTenant
}

/**
 * Set (merge) a tenant's economy policy — called by the app layer when the persisted
 * tenant_economy_config loads or the manager flips the switch. Defaults to the active tenant.
 */
export function setEconomyPolicy(policy: Partial<EconomyPolicy>, tenantId: string = activeTenant): void {
  const cur = byTenant.get(tenantId) ?? DEFAULT_ECONOMY_POLICY
  byTenant.set(tenantId, { ...cur, ...policy })
}

/** A tenant's full policy (the default credit policy if none was set). */
export function getEconomyPolicy(tenantId: string = activeTenant): EconomyPolicy {
  return byTenant.get(tenantId) ?? DEFAULT_ECONOMY_POLICY
}

/** The economy mode in force for a tenant (the active book by default). */
export function getEconomyMode(tenantId: string = activeTenant): EconomyMode {
  return getEconomyPolicy(tenantId).mode
}

/** The balance floor (cents) in force for a tenant. Only meaningful in balance mode. */
export function getBalanceFloorCents(tenantId: string = activeTenant): number {
  return getEconomyPolicy(tenantId).balanceFloorCents
}

/** Test/boot helper: clear all policy back to the default-credit baseline. */
export function __resetEconomy(): void {
  activeTenant = DEFAULT_TENANT
  byTenant.clear()
}
