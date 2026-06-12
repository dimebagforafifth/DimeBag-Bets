/**
 * Exposure-aware AUTO-RULES for the advanced trading desk (CLAUDE.md §4) — Part 3.
 *
 * Two rules a trader can arm so the book defends itself between manual touches:
 *  - an EXPOSURE rule: "if net one-sided exposure on a market exceeds X, move the line N
 *    increments toward balance" — sheds risk off the heavy side automatically;
 *  - a DRIFT rule: "auto-suspend a market if the SOURCE line moves more than Y points
 *    within Z minutes" — pulls a market the instant the feed lurches (a likely steam move
 *    or a bad number) so the book isn't picked off.
 *
 * The config persists; the evaluators here are PURE (no time, no state) so they're fully
 * testable, and the desk both previews their effect and — where wired — applies it
 * through the same overlay mutators a manager uses (so every auto-move is audited too).
 */

import { createStore, persistedDoc, type Doc } from '../../persistence/index.js'

export interface ExposureRule {
  enabled: boolean
  /** Trigger when one side's net exposure (cents) exceeds the other by this much. */
  maxSideExposureCents: number
  /** How many ½-point increments to move the line toward balance when breached. */
  moveIncrements: number
}

export interface DriftRule {
  enabled: boolean
  /** Auto-suspend when the source line moves more than this many points… */
  maxLineMove: number
  /** …within this many minutes. */
  withinMinutes: number
}

export interface AutoRulesConfig {
  exposure: ExposureRule
  drift: DriftRule
}

export const DEFAULT_AUTORULES: AutoRulesConfig = {
  exposure: { enabled: false, maxSideExposureCents: 50_000, moveIncrements: 1 },
  drift: { enabled: false, maxLineMove: 1.5, withinMinutes: 5 },
}

/**
 * Decide whether the exposure rule fires and which way to move. Returns the signed line
 * delta (in points) toward balance — negative trims the home/over side, positive the
 * away/under side — or null if balanced/under-threshold/disabled.
 */
export function evaluateExposureRule(
  rule: ExposureRule,
  homeExposureCents: number,
  awayExposureCents: number,
): { deltaPoints: number; toward: 'home' | 'away' } | null {
  if (!rule.enabled) return null
  const gap = homeExposureCents - awayExposureCents
  if (Math.abs(gap) <= rule.maxSideExposureCents) return null
  const step = rule.moveIncrements * 0.5
  // Heavier on home → move the line to make home worse / away better → trim toward away.
  return gap > 0 ? { deltaPoints: -step, toward: 'away' } : { deltaPoints: step, toward: 'home' }
}

/**
 * Decide whether the drift rule fires, given time-ordered source-line observations. Fires
 * when the line moved more than `maxLineMove` within any `withinMinutes` window.
 */
export function evaluateDriftRule(
  rule: DriftRule,
  observations: Array<{ at: number; line: number }>,
): { suspend: boolean; movedBy: number } | null {
  if (!rule.enabled || observations.length < 2) return null
  const windowMs = rule.withinMinutes * 60_000
  let worst = 0
  for (let i = 0; i < observations.length; i++) {
    for (let j = i + 1; j < observations.length; j++) {
      if (observations[j].at - observations[i].at > windowMs) break
      worst = Math.max(worst, Math.abs(observations[j].line - observations[i].line))
    }
  }
  return worst > rule.maxLineMove ? { suspend: true, movedBy: worst } : { suspend: false, movedBy: worst }
}

/* ----------------------------- persisted config ---------------------------- */

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<AutoRulesConfig> = persistedDoc<AutoRulesConfig>(store, 'lines.autorules', {
  version: 1,
  initial: DEFAULT_AUTORULES,
})

let config: AutoRulesConfig = DOC.load() ?? DEFAULT_AUTORULES
let version = 0
const listeners = new Set<() => void>()

export function getAutoRules(): AutoRulesConfig {
  return config
}
export function setAutoRules(patch: Partial<AutoRulesConfig>): void {
  config = { ...config, ...patch }
  DOC.save(config)
  version += 1
  listeners.forEach((l) => l())
}
export function subscribeAutoRules(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
export function getAutoRulesVersion(): number {
  return version
}
export function resetAutoRules(): void {
  setAutoRules(DEFAULT_AUTORULES)
}
