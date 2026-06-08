/**
 * The book-settings store — the operator's persisted operational settings
 * (CLAUDE.md §4 "Operational book settings"). Same blueprint as app/edge-store.ts
 * and app/book-store.ts: a framework-agnostic external store (subscribe / version
 * snapshot) mirrored into React with `useSyncExternalStore`, persisted via
 * `persistedDoc` under namespace 'dimebag'.
 *
 * It holds three book-level operational settings:
 *   - the settlement cadence (period length) + when the book was last settled,
 *   - the default credit limit granted to a newly-recruited member,
 *   - which games are DISABLED (absent ⇒ enabled, so the ship state = all on).
 *
 * It moves NO money (CLAUDE.md §3) — these are config values consumed by the
 * settlement flow, the recruit form, and the lobby/placement guards (later phases).
 * One Org/book per browser, so this single doc IS the per-book setting; key it by
 * `org.managerId` if multiple books ever coexist.
 */

import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import type { RiskThresholds } from './risk.js'

const DAY_MS = 24 * 60 * 60 * 1000

export interface BookSettings {
  /** Settlement cadence in days (default 7 = weekly). */
  settlementPeriodDays: number
  /** Default credit limit granted to a newly-recruited member, in cents. */
  defaultCreditLimit: number
  /** gameKey → true to DISABLE it. Absent ⇒ enabled (ship state = all games on). */
  disabledGames: Record<string, true>
  /** When the book was last settled (epoch ms); 0 = never settled yet. Drives the
   *  "settlement due" indicator without auto-firing anything. */
  lastSettledAt: number
  /** Risk alert: flag a player at/above this fraction (0..1) of credit used. */
  riskCreditUtil: number
  /** Risk alert: flag when book live exposure exceeds this many cents (null = off). */
  riskExposureCap: number | null
}

/** The ship defaults — a weekly book, a sensible starter credit line, all games on. */
const DEFAULTS: BookSettings = {
  settlementPeriodDays: 7,
  defaultCreditLimit: 20_000,
  disabledGames: {},
  lastSettledAt: 0,
  riskCreditUtil: 0.8,
  riskExposureCap: null,
}

const store = createStore({ namespace: 'dimebag' })
const SETTINGS_DOC: Doc<BookSettings> = persistedDoc<BookSettings>(store, 'settings.config', {
  // Do NOT bump this version for purely additive fields — the load-merge over
  // DEFAULTS below backfills them. Bumping without a `migrate` makes load() fall back
  // to DEFAULTS and silently drop all stored operator settings; only a non-additive
  // shape change warrants a version bump, and it must ship a migrate alongside.
  version: 1,
  initial: DEFAULTS,
})

// Merge over DEFAULTS so a stored payload from an earlier (additive) shape still
// gets any newly-added field — no migration needed for purely additive settings.
const config: BookSettings = { ...DEFAULTS, ...SETTINGS_DOC.load() }
const listeners = new Set<() => void>()
let version = 0

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

function persist(): void {
  SETTINGS_DOC.save(config)
  notify()
}

/* -------------------------------- the API ------------------------------- */

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSettingsVersion(): number {
  return version
}

/** The live settings (stable reference; mutated in place). */
export function getSettings(): BookSettings {
  return config
}

/** Set the settlement cadence in whole days (≥ 1). */
export function setSettlementPeriodDays(days: number): void {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`settlement period must be a whole number of days ≥ 1, got ${days}`)
  }
  config.settlementPeriodDays = days
  persist()
}

/** Set the default credit limit for newly-recruited members (cents, ≥ 0). */
export function setDefaultCreditLimit(cents: number): void {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`default credit limit must be a whole number ≥ 0, got ${cents}`)
  }
  config.defaultCreditLimit = cents
  persist()
}

/** Whether a game is enabled for play (the default unless explicitly disabled). */
export function isGameEnabled(gameKey: string): boolean {
  return !config.disabledGames[gameKey]
}

/** Enable or disable a game for the whole book. */
export function setGameEnabled(gameKey: string, enabled: boolean): void {
  if (enabled) delete config.disabledGames[gameKey]
  else config.disabledGames[gameKey] = true
  persist()
}

/** Stamp the book as settled at `at` (epoch ms) — anchors the next due date. */
export function markSettled(at: number): void {
  config.lastSettledAt = at
  persist()
}

/** When the next settlement is due (epoch ms); 0 until the first settlement anchors
 *  the clock. Pure read off the current cadence. */
export function settlementDueAt(): number {
  return config.lastSettledAt === 0 ? 0 : config.lastSettledAt + config.settlementPeriodDays * DAY_MS
}

/** Whether a settlement is due as of `now` (false until the first settle anchors the
 *  cadence — a brand-new book isn't "overdue"). */
export function isSettlementDue(now: number): boolean {
  const due = settlementDueAt()
  return due !== 0 && now >= due
}

/** The risk thresholds as a RiskThresholds (for risk.checkAlerts). */
export function getRiskThresholds(): RiskThresholds {
  return { creditUtil: config.riskCreditUtil, exposureCap: config.riskExposureCap }
}

/** Set the credit-utilization alert threshold (a fraction 0..1). */
export function setRiskCreditUtil(fraction: number): void {
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) {
    throw new Error(`credit-utilization threshold must be in (0, 1], got ${fraction}`)
  }
  config.riskCreditUtil = fraction
  persist()
}

/** Set the book-exposure alert cap in cents (null = off; ≥ 0). */
export function setRiskExposureCap(cents: number | null): void {
  if (cents != null && (!Number.isInteger(cents) || cents < 0)) {
    throw new Error(`exposure cap must be a whole number ≥ 0 (or null to clear), got ${cents}`)
  }
  config.riskExposureCap = cents
  persist()
}
