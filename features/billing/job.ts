/**
 * The weekly per-head head-count job.
 *
 * Walks the manager's downline (reusing org/ scoping — reads ACTIVITY, never figures), marks
 * each player active/inactive by the settled-wager definition, counts the active heads, and
 * prices them into a billing_period draft.
 *
 * READ-ONLY over the money world. This module imports NOTHING from `core/` and never calls a
 * core money function — heads are a pure tree traversal + a settled-wager lookup; the fee is
 * derived from the count. (Asserted by billing/invariant.test.ts.)
 */

import { getBookLedger } from '../../app/book-ledger.js'
import { agentOf, rosterOf, type Org } from '../org/index.js'
import { DEFAULT_ACTIVE_DEFINITION } from './config.js'
import { computeBill } from './fees.js'
import type {
  ActiveDefinition,
  BillingConfig,
  BillingHeadSnapshot,
  BillingPeriod,
} from './types.js'

/**
 * A minimal, read-only view of one settled-wager record — the subset the active definition
 * needs. Maps 1:1 onto a book-ledger 'resolve' entry: `accountId` + the settlement time `at`.
 */
export interface ActivityRecord {
  accountId: string
  at: number
  kind: string
}

/** Supplies settled-wager activity for the active-head test. Injectable so the job is pure
 *  to test and the durable source can be swapped (see the SEAM on the default reader). */
export interface ActivityReader {
  /** Settled-wager records in (or covering) [weekStart, weekEnd); the job re-filters by window. */
  settledWagers(weekStart: number, weekEnd: number): ActivityRecord[]
  /** True when the source is guaranteed to cover the whole window (no eviction inside it). When a
   *  reader can't guarantee it (the capped book-ledger), returning false makes the job mark the
   *  invoice as possibly-undercounted instead of silently issuing a low bill. Defaults to true. */
  coversWindow?(weekStart: number, weekEnd: number): boolean
}

/** The book-ledger keeps only the most-recent ~1000 entries (app/book-ledger MAX_PERSISTED). */
const LEDGER_SNAPSHOT_CAP = 1000

/**
 * The default activity source: the in-app book-ledger (app/book-ledger.ts) — the one durable,
 * cross-module record of settled wagers. Every casino game, the sportsbook, and p2p funnel
 * through `core.resolveWager`/`resolveAtMultiplier` → `onWagerResolved` → a 'resolve' entry
 * carrying `accountId` + `at`. Reading it is mode-agnostic (a settled wager is recorded
 * identically in credit and balance mode).
 *
 * // SEAM (production source): the book-ledger keeps only the most-recent ~1000 entries and is
 * a per-tab snapshot, so a real weekly billing CRON cannot reliably read a full week from it,
 * and once the server-authoritative money RPC path is switched on, settlement stops emitting
 * the in-browser event. The production reader must query an UNCAPPED server `transactions`
 * table (account_id, kind='resolve', settled_at within the week) written by the RPC. Swap this
 * implementation for that reader by passing `activity` to runHeadCountJob — nothing else changes.
 * Billing reads this surface ONLY; it never writes money.
 */
export const bookLedgerActivityReader: ActivityReader = {
  settledWagers: () =>
    getBookLedger().map((e) => ({ accountId: e.accountId, at: e.at, kind: e.kind })),
  coversWindow: (weekStart) => {
    // getBookLedger() is newest-first. If eviction is active (length at the cap) AND the oldest
    // retained entry already sits on/after the week start, earlier entries from this week may have
    // been evicted — coverage is not guaranteed. Otherwise the week is fully covered.
    const entries = getBookLedger()
    if (entries.length < LEDGER_SNAPSHOT_CAP) return true
    const oldest = entries[entries.length - 1]
    return oldest ? oldest.at < weekStart : true
  },
}

/** How many SETTLED wagers (graded bets, any outcome) the account placed in [weekStart, weekEnd). */
export function settledWagerCount(
  records: ActivityRecord[],
  accountId: string,
  weekStart: number,
  weekEnd: number,
): number {
  let n = 0
  for (const r of records) {
    if (r.kind === 'resolve' && r.accountId === accountId && r.at >= weekStart && r.at < weekEnd) {
      n += 1
    }
  }
  return n
}

/** Did the account meet the active definition this week? PURE. */
export function wasActiveInWeek(
  records: ActivityRecord[],
  accountId: string,
  weekStart: number,
  weekEnd: number,
  def: ActiveDefinition = DEFAULT_ACTIVE_DEFINITION,
): boolean {
  return settledWagerCount(records, accountId, weekStart, weekEnd) >= def.minSettledWagers
}

export interface HeadCountInput {
  org: Org
  weekStart: number
  weekEnd: number
  config: BillingConfig
  /** Defaults to the whole book (org.managerId). Pass an agent id to bill a sub-scope. */
  rootId?: string
  /** Activity source; defaults to the book-ledger reader. */
  activity?: ActivityReader
  /** This billed period falls in the free-weeks allotment → waive. */
  freeWeek?: boolean
  /** Stamps for the produced period. */
  tenantId: string
  id: string
  now: number
}

/**
 * Build a billing_period for [weekStart, weekEnd): traverse the downline, snapshot each
 * player's active/inactive state by the settled-wager definition, count active heads, price.
 * Inactive (suspended) members never count as a billable head. READ-ONLY — no money moves.
 */
export function runHeadCountJob(input: HeadCountInput): BillingPeriod {
  const { org, weekStart, weekEnd, config, tenantId, id, now } = input
  const rootId = input.rootId ?? org.managerId
  const activity = input.activity ?? bookLedgerActivityReader
  const records = activity.settledWagers(weekStart, weekEnd)

  const snapshots: BillingHeadSnapshot[] = rosterOf(org, rootId).map((p) => {
    const suspended = !p.active
    const active =
      !suspended &&
      wasActiveInWeek(records, p.account.id, weekStart, weekEnd, config.activeDefinition)
    const agent = agentOf(org, p.id)
    return {
      playerId: p.id,
      playerName: p.name,
      agentId: agent?.id ?? null,
      agentName: agent?.name ?? null,
      active,
      reason: suspended ? 'inactive' : active ? 'settled-wager' : 'no-activity',
    }
  })

  const activeHeadCount = snapshots.filter((s) => s.active).length
  const bill = computeBill(config, { activeHeadCount, freeWeek: input.freeWeek })
  const coverageComplete = activity.coversWindow?.(weekStart, weekEnd) ?? true

  return {
    id,
    tenantId,
    weekStart,
    weekEnd,
    activeHeadCount,
    billedHeadCount: bill.billedHeadCount,
    baseCents: bill.baseCents,
    addonCents: bill.addonCents,
    discountCents: bill.discountCents,
    totalCents: bill.totalCents,
    currency: config.currency,
    status: bill.status,
    waivedReason: bill.waivedReason,
    coverageComplete,
    snapshots,
    createdAt: now,
  }
}
