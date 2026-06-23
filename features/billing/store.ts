/**
 * The billing store — persisted billing_config + the billing_period invoice history.
 *
 * Follows the house store pattern (createStore → persistedDoc, module-level state + a version
 * counter + listeners, useSyncExternalStore-friendly): localStorage/in-memory by DEFAULT, and
 * automatically Supabase-backed when keys are present — byte-identical with no keys. Ids come
 * from a persisted seq counter and the clock is passed in (`now`), so the store is deterministic.
 *
 * MONEY SAFETY — the exception to the repo's "money only through core" rule: billing is operator
 * FIAT (real US dollars), explicitly NOT the player points figure. It moves NO core money, holds
 * its dollars only in its own persisted doc, and imports NOTHING from `core/`. (See
 * billing/invariant.test.ts.) Config changes are gated to the manager.
 */

import { createStore, persistedDoc, getActiveTenant, type Doc } from '../../persistence/index.js'
import { getBook } from '../../app/book-store.js'
import { getViewer } from '../../app/viewer.js'
import { DEFAULT_BILLING_CONFIG } from './config.js'
import { computeBill } from './fees.js'
import { bookLedgerActivityReader, runHeadCountJob } from './job.js'
import type { BillingConfig, BillingPeriod, BillingStatus } from './types.js'

interface BillingState {
  seq: number
  config: BillingConfig
  periods: BillingPeriod[]
}

const INITIAL: BillingState = { seq: 0, config: DEFAULT_BILLING_CONFIG, periods: [] }

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<BillingState> = persistedDoc<BillingState>(store, 'billing.state', {
  version: 1,
  initial: INITIAL,
})

let state: BillingState = load()
let version = 0
const listeners = new Set<() => void>()

/** Load, shallow-merging over the defaults so additive top-level SCALAR config fields backfill
 *  without a version bump. Nested/array fields (addons, tiers, activeDefinition) are taken
 *  wholesale from the stored config; reaching a new default into those needs a version + migrate. */
function load(): BillingState {
  const doc = DOC.load() ?? INITIAL
  return { ...INITIAL, ...doc, config: { ...DEFAULT_BILLING_CONFIG, ...doc.config } }
}

function notify(): void {
  DOC.save(state)
  version += 1
  for (const l of listeners) l()
}

function nextId(prefix: string): string {
  state.seq += 1
  return `${prefix}-${state.seq}`
}

function requireManager(): void {
  if (getViewer().role !== 'manager') {
    throw new Error('only the manager can change billing')
  }
}

/* --------------------------------- reads --------------------------------- */

export function subscribeBilling(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function getBillingVersion(): number {
  return version
}
export function getBillingConfig(): BillingConfig {
  return state.config
}
/** Invoices, newest week first. */
export function listPeriods(): BillingPeriod[] {
  return [...state.periods].sort((a, b) => b.weekStart - a.weekStart || b.createdAt - a.createdAt)
}
export function getPeriod(id: string): BillingPeriod | undefined {
  return state.periods.find((p) => p.id === id)
}

/* ------------------------------ config writes ----------------------------- */

/** Patch the billing config (manager only). Validates every numeric field. */
export function updateBillingConfig(patch: Partial<BillingConfig>): BillingConfig {
  requireManager()
  const next: BillingConfig = { ...state.config, ...patch }
  assertConfig(next)
  state = { ...state, config: next }
  notify()
  return next
}

function assertConfig(c: BillingConfig): void {
  const intGte = (n: number, min: number): boolean => Number.isInteger(n) && n >= min
  if (!intGte(c.baseRateCentsPerHead, 0)) throw new Error('base rate must be whole cents ≥ 0')
  if (!intGte(c.freeWeeks, 0)) throw new Error('free weeks must be a whole number ≥ 0')
  if (!intGte(c.cryptoDiscountBps, 0) || c.cryptoDiscountBps > 10_000)
    throw new Error('crypto discount must be 0–10000 bps')
  if (!intGte(c.activeDefinition.minSettledWagers, 1))
    throw new Error('active definition needs at least 1 settled wager')
  for (const t of c.tiers) {
    if (!intGte(t.minHeads, 0)) throw new Error('tier minHeads must be ≥ 0')
    if (!intGte(t.rateCentsPerHead, 0)) throw new Error('tier rate must be ≥ 0')
  }
  for (const a of c.addons) {
    if (!intGte(a.perHeadCents, 0)) throw new Error('add-on per-head must be ≥ 0')
    if (!intGte(a.flatCents, 0)) throw new Error('add-on flat must be ≥ 0')
  }
}

/* ------------------------------- the job ---------------------------------- */

/** Is the next period one of the operator's free onboarding weeks? Free weeks are the first N
 *  genuinely-billable weeks: seeded demo invoices and seasonal-pause-waived weeks (which were
 *  never onboarding weeks) must NOT draw down the grant — only real billed weeks and the free
 *  weeks themselves consume it. */
function isFreeWeek(): boolean {
  const consumed = state.periods.filter(
    (p) => !p.seeded && p.waivedReason !== 'seasonal-pause',
  ).length
  return consumed < state.config.freeWeeks
}

interface RunOpts {
  weekStart: number
  weekEnd: number
  now: number
  /** Defaults to the whole book. Pass an agent id to scope the bill to a sub-tree. */
  rootId?: string
}

function buildPeriod(opts: RunOpts, id: string): BillingPeriod {
  return runHeadCountJob({
    org: getBook(),
    weekStart: opts.weekStart,
    weekEnd: opts.weekEnd,
    config: state.config,
    rootId: opts.rootId,
    activity: bookLedgerActivityReader,
    freeWeek: isFreeWeek(),
    tenantId: getActiveTenant(),
    id,
    now: opts.now,
  })
}

/**
 * Live projection for a week WITHOUT persisting — the panel's running head count + projected
 * fee. Read-only.
 */
export function previewPeriod(opts: RunOpts): BillingPeriod {
  return buildPeriod(opts, 'preview')
}

/** Run the head-count job for [weekStart, weekEnd) and persist the resulting draft invoice
 *  (manager only). Reads the live book + activity; moves NO money. */
export function generatePeriod(opts: RunOpts): BillingPeriod {
  requireManager()
  const period = buildPeriod(opts, nextId('inv'))
  state = { ...state, periods: [period, ...state.periods] }
  notify()
  return period
}

/* ---------------------------- status transitions -------------------------- */

/** Move an invoice to a new status (manager only); stamps issued/paid time. */
export function setPeriodStatus(id: string, status: BillingStatus, now: number): BillingPeriod {
  requireManager()
  const idx = state.periods.findIndex((p) => p.id === id)
  if (idx < 0) throw new Error(`no billing period ${id}`)
  const cur = state.periods[idx]
  const next: BillingPeriod = {
    ...cur,
    status,
    issuedAt: status === 'issued' ? now : cur.issuedAt,
    paidAt: status === 'paid' ? now : cur.paidAt,
  }
  const periods = [...state.periods]
  periods[idx] = next
  state = { ...state, periods }
  notify()
  return next
}

export const issuePeriod = (id: string, now: number): BillingPeriod =>
  setPeriodStatus(id, 'issued', now)
export const markPeriodPaid = (id: string, now: number): BillingPeriod =>
  setPeriodStatus(id, 'paid', now)
export const waivePeriod = (id: string, now: number): BillingPeriod =>
  setPeriodStatus(id, 'waived', now)

/* ------------------------------- demo seed -------------------------------- */

/** A fixed timestamp so the seed is deterministic (the store never reads the clock itself). */
const SEED_NOW = 1_718_000_000_000
const WEEK = 7 * 24 * 60 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

/** Seed a few realistic PAST invoices so the panel isn't empty on first run. Creates RECORDS
 *  ONLY — moves no money, touches no core, never the points ledger. */
function seedIfEmpty(now: number = SEED_NOW): void {
  if (state.periods.length > 0) return
  const tenantId = getActiveTenant()
  const sample = (weeksAgo: number, heads: number, status: BillingStatus): BillingPeriod => {
    const weekStart = now - weeksAgo * WEEK
    const weekEnd = weekStart + WEEK
    const bill = computeBill(state.config, { activeHeadCount: heads })
    return {
      id: nextId('inv'),
      tenantId,
      weekStart,
      weekEnd,
      activeHeadCount: heads,
      billedHeadCount: bill.billedHeadCount,
      baseCents: bill.baseCents,
      addonCents: bill.addonCents,
      discountCents: bill.discountCents,
      totalCents: bill.totalCents,
      currency: state.config.currency,
      status,
      coverageComplete: true,
      seeded: true,
      snapshots: [],
      createdAt: weekEnd,
      issuedAt: status !== 'draft' ? weekEnd : undefined,
      paidAt: status === 'paid' ? weekEnd + 2 * DAY : undefined,
    }
  }
  // Build the array FIRST so the nextId() calls advance state.seq before the spread captures it —
  // otherwise the spread snapshots seq=0 and the first real invoice would collide at 'inv-1'.
  const periods = [sample(1, 18, 'issued'), sample(2, 22, 'paid'), sample(3, 15, 'paid')]
  state = { ...state, periods }
  notify()
}

/* ------------------------------- test hooks ------------------------------- */

export function __resetBilling(): void {
  state = { seq: 0, config: { ...DEFAULT_BILLING_CONFIG }, periods: [] }
  notify()
}
export function __seedBilling(now: number = SEED_NOW): void {
  seedIfEmpty(now)
}

seedIfEmpty()
