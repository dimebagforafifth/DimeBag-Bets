/**
 * The tenant economy config + the mid-season migration (CLAUDE.md §3, §6).
 *
 * This is the app-layer owner of the persisted `tenant_economy_config` — the manager-set
 * switch between the credit (PPH) economy and the balance (wallet) economy. It mirrors the
 * persisted config into core's policy (so `availableToWager`/settlement/audit read one source
 * of truth), gates the flip to the manager, and runs the audited migration that moves the book
 * from one economy to the other through `core` only.
 *
 * MONEY SAFETY: the migration moves every credit through the audited `adjustFigure` (which
 * records a book-ledger entry + an audit entry per move), so the ledger is a complete account
 * of the change — no direct balance writes, no parallel path. OFF-BY-DEFAULT: a book with no
 * saved config is credit / floor 0, identical to today.
 */

import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import { getActiveTenant } from '../persistence/tenant.js'
import {
  getEconomyMode as coreGetEconomyMode,
  setEconomyPolicy,
  setActiveEconomyTenant,
  type EconomyMode,
} from '../core/index.js'
import { membersByRole, type Org } from '../org/index.js'
import { getBook, mutateBook } from './book-store.js'
import { adjustFigure } from './manager-actions.js'
import { recordAudit } from './audit-store.js'
import { getViewer } from './viewer.js'
import { formatMoney } from '../games/shared/money.js'

/* ------------------------------- the schema -------------------------------- */

/** Persisted per-tenant (the store is tenant-scoped, so this is the active book's config). */
export interface TenantEconomyConfig {
  /** The active economy. Default 'credit' preserves the PPH model exactly. */
  economyMode: EconomyMode
  /** Balance mode: the lowest a wallet may be driven (cents). Default 0 = non-negative. */
  balanceFloorCents: number
  /** Credit mode: the credit line a new/migrated player is opened with (cents). */
  creditDefaultLimitCents: number
  /** A flip is blocked until this epoch-ms (anti-thrash cooldown). 0 = unlocked. */
  modeLockedUntil: number
  /** When the mode was last changed (epoch ms; 0 = never). */
  modeChangedAt: number
  /** Who last changed it (operator id; '' = never). */
  modeChangedBy: string
}

export const DEFAULT_ECONOMY_CONFIG: TenantEconomyConfig = {
  economyMode: 'credit',
  balanceFloorCents: 0,
  creditDefaultLimitCents: 100_000, // $1,000 default credit line on migrate
  modeLockedUntil: 0,
  modeChangedAt: 0,
  modeChangedBy: '',
}

/** How long after a flip the mode is locked from flipping again (a week). */
export const MODE_LOCK_MS = 7 * 86_400_000

/* ------------------------------- the store --------------------------------- */

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<TenantEconomyConfig> = persistedDoc<TenantEconomyConfig>(store, 'economy.config', {
  version: 1,
  initial: DEFAULT_ECONOMY_CONFIG,
})

let config: TenantEconomyConfig = DOC.load() ?? DEFAULT_ECONOMY_CONFIG
let version = 0
const listeners = new Set<() => void>()

function syncCore(): void {
  // Mirror the persisted config into core's policy for the active tenant, so placeWager /
  // settlement / the audit envelope all read one source of truth.
  setActiveEconomyTenant(getActiveTenant())
  setEconomyPolicy({ mode: config.economyMode, balanceFloorCents: config.balanceFloorCents })
}

// Boot sync: push the saved economy into core at import. Moves NO money — just policy.
syncCore()

function notify(): void {
  DOC.save(config)
  syncCore()
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeEconomyConfig(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function getEconomyConfigVersion(): number {
  return version
}
export function getEconomyConfig(): TenantEconomyConfig {
  return config
}

/** The active book's economy mode (reads core, which `syncCore` keeps in step with the
 *  persisted config). The `tenantId` arg matches core's signature for forward compatibility. */
export function getEconomyMode(tenantId?: string): EconomyMode {
  return coreGetEconomyMode(tenantId)
}

/** Whether the current viewer may change the economy mode — the MANAGER only. Agents inherit
 *  the book's mode and can never deviate (§3). */
export function canSetEconomyMode(): boolean {
  return getViewer().role === 'manager'
}

/* ------------------------------- migration --------------------------------- */

/** How each player's opening wallet is seeded when migrating credit → balance. */
export type SeedRule =
  | { kind: 'preserve' } // open at the player's pre-migration figure (clamped ≥ floor)
  | { kind: 'flat'; cents: number } // open every player at the same balance

export interface MigrationLine {
  memberId: string
  name: string
  beforeCents: number
  afterCents: number
  deltaCents: number
}
export interface MigrationReport {
  from: EconomyMode
  to: EconomyMode
  totalBeforeCents: number
  totalAfterCents: number
  /** Net of every audited move the migration made (== totalAfter − totalBefore). */
  ledgerDeltaCents: number
  lines: MigrationLine[]
}

const ACTOR = 'economy-migration'

/** Sum of every member's figure (the book total). */
function bookTotal(org: Org): number {
  return Object.values(org.members).reduce((s, m) => s + m.account.balance, 0)
}

/**
 * Compute what a migration WOULD do, without applying it — drives the manager's confirmation
 * preview. Pure read. `seed` only matters for credit → balance.
 */
export function previewMigration(to: EconomyMode, seed: SeedRule = { kind: 'preserve' }): MigrationReport {
  const org = getBook()
  const from = coreGetEconomyMode()
  const players = membersByRole(org, 'player')
  const lines: MigrationLine[] = []

  if (to === 'balance') {
    // Every figure closes out to zero, then each PLAYER's wallet opens per the seed rule.
    for (const m of Object.values(org.members)) {
      const before = m.account.balance
      let after = 0
      if (m.role === 'player') {
        after = seed.kind === 'flat' ? seed.cents : Math.max(config.balanceFloorCents, before)
      }
      if (before !== after) lines.push({ memberId: m.id, name: m.name, beforeCents: before, afterCents: after, deltaCents: after - before })
    }
  } else {
    // balance → credit: figures are preserved as the opening figure; a credit line is added on
    // top (no figure move under the default), so there are no money lines — only limit changes.
    for (const p of players) {
      lines.push({ memberId: p.id, name: p.name, beforeCents: p.account.balance, afterCents: p.account.balance, deltaCents: 0 })
    }
  }

  const totalBefore = bookTotal(org)
  const totalAfter = to === 'balance'
    ? Object.values(org.members).reduce((s, m) => {
        if (m.role !== 'player') return s
        return s + (seed.kind === 'flat' ? seed.cents : Math.max(config.balanceFloorCents, m.account.balance))
      }, 0)
    : totalBefore
  return { from, to, totalBeforeCents: totalBefore, totalAfterCents: totalAfter, ledgerDeltaCents: totalAfter - totalBefore, lines }
}

/**
 * credit → balance: a final close-out of every figure to zero (audited), the policy flip, then
 * seed each player's opening wallet per the manager rule (audited). Every credit move goes
 * through `adjustFigure`, so the book ledger fully accounts for the change.
 */
function runToBalance(seed: SeedRule, now: number): MigrationReport {
  const org = getBook()
  const totalBefore = bookTotal(org)
  const lines: MigrationLine[] = []
  let ledgerDelta = 0

  // 1) Close out every non-zero figure to zero — the final credit-mode act.
  for (const m of Object.values(org.members)) {
    const before = m.account.balance
    if (before !== 0) {
      adjustFigure(m.id, -before, 'Economy migration: credit→balance close-out', ACTOR)
      ledgerDelta += -before
    }
    // 2) (players only) open the wallet per the seed rule.
    let after = 0
    if (m.role === 'player') {
      after = seed.kind === 'flat' ? seed.cents : Math.max(config.balanceFloorCents, before)
      if (after !== 0) {
        adjustFigure(m.id, after, 'Economy migration: opening wallet balance', ACTOR)
        ledgerDelta += after
      }
    }
    if (before !== after) lines.push({ memberId: m.id, name: m.name, beforeCents: before, afterCents: after, deltaCents: after - before })
  }

  config = { ...config, economyMode: 'balance', modeChangedAt: now }
  return { from: 'credit', to: 'balance', totalBeforeCents: totalBefore, totalAfterCents: bookTotal(org), ledgerDeltaCents: ledgerDelta, lines }
}

/**
 * balance → credit: open the credit period with figures PRESERVED (the wallet balance becomes
 * the opening figure — the default, so no money moves) and assign every player the default
 * credit line. Setting a limit is a config change (not a balance write), recorded in the audit
 * trail; the figure itself is untouched, so the ledger total is trivially conserved.
 */
function runToCredit(now: number): MigrationReport {
  const org = getBook()
  const totalBefore = bookTotal(org)
  const limit = config.creditDefaultLimitCents
  const lines: MigrationLine[] = []

  mutateBook((o) => {
    for (const p of membersByRole(o, 'player')) {
      const oldLimit = p.account.creditLimit
      p.account.creditLimit = limit
      if (oldLimit !== limit) {
        recordAudit({
          actor: ACTOR,
          action: 'credit',
          memberId: p.id,
          memberName: p.name,
          detail: `Credit limit ${formatMoney(oldLimit)} → ${formatMoney(limit)} (balance→credit migration)`,
        })
      }
      lines.push({ memberId: p.id, name: p.name, beforeCents: p.account.balance, afterCents: p.account.balance, deltaCents: 0 })
    }
  })

  config = { ...config, economyMode: 'credit', modeChangedAt: now }
  return { from: 'balance', to: 'credit', totalBeforeCents: totalBefore, totalAfterCents: bookTotal(org), ledgerDeltaCents: 0, lines }
}

/* ------------------------------- the public flip --------------------------- */

export interface SetModeResult {
  report: MigrationReport
}

/**
 * Flip the book's economy mode (MANAGER only). Runs the audited migration, persists the new
 * config, mirrors it into core, and stamps the audit trail. Throws (changing nothing) if the
 * caller isn't a manager, the mode is unchanged, or the mode is still locked from a recent flip.
 */
export function setEconomyMode(
  to: EconomyMode,
  opts: { seed?: SeedRule; now?: number; actor?: string } = {},
): SetModeResult {
  if (getViewer().role !== 'manager') {
    throw new Error('only the manager can change the economy mode; agents inherit it')
  }
  const now = opts.now ?? Date.now()
  if (to === config.economyMode) {
    throw new Error(`the book is already in ${to} mode`)
  }
  if (config.modeLockedUntil > now) {
    throw new Error('the economy mode is locked from changing again right now')
  }
  // No MID-BET flip (interlock #8). The migration closes figures out (runToBalance zeroes them)
  // but leaves `pending` untouched, and a later resolve is NOT floor-gated — so a wager placed
  // before the flip would resolve against a zeroed balance and could push it below the floor.
  // Refuse the flip while ANY wager is open; grade or void them first. Mirrors core settleWeek,
  // which likewise refuses to square up with pending still on the book.
  const openPending = Object.values(getBook().members).filter((m) => m.account.pending !== 0)
  if (openPending.length > 0) {
    throw new Error(
      `cannot change the economy mode while ${openPending.length} wager(s) are still open; ` +
        `grade or void all pending bets first`,
    )
  }

  const actor = opts.actor ?? getViewer().memberId
  const report = to === 'balance' ? runToBalance(opts.seed ?? { kind: 'preserve' }, now) : runToCredit(now)

  // A flip does NOT self-lock by default (so a book can be moved back if it was a mistake); an
  // operator sets `modeLockedUntil` explicitly (updateEconomyConfig) to rate-limit flips —
  // MODE_LOCK_MS is the suggested cooldown.
  config = { ...config, modeChangedBy: actor }
  notify() // persists config + syncs core to the new mode

  recordAudit({
    actor,
    action: 'economy-mode',
    memberId: '',
    memberName: 'Whole book',
    detail: `Economy mode ${report.from} → ${report.to} (${report.lines.length} accounts migrated)`,
  })
  return { report }
}

/** Patch the non-mode config knobs (manager only) — the balance floor, default credit line, and
 *  the optional flip-cooldown deadline (`modeLockedUntil`). */
export function updateEconomyConfig(
  patch: Partial<Pick<TenantEconomyConfig, 'balanceFloorCents' | 'creditDefaultLimitCents' | 'modeLockedUntil'>>,
): void {
  if (getViewer().role !== 'manager') throw new Error('only the manager can change the economy config')
  config = { ...config, ...patch }
  notify()
}

/** Test helper: restore the default-credit baseline + re-sync core. */
export function __resetEconomyConfig(): void {
  config = { ...DEFAULT_ECONOMY_CONFIG }
  notify()
}
