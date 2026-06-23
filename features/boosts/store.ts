/**
 * The boost store — operator-authored boost definitions, persisted (mock/localStorage default,
 * off-by-default: an empty store changes nothing). Saving a boost UPSERTS its companion
 * bonus-engine rule (the grant machinery lives in the engine; the slip qualifier lives here), so
 * a boost is always a real `profit-boost` bonus rule. This module moves NO money — issuance
 * happens at settlement through the engine (engine.ts → grantRuleTo).
 */

import { createStore, persistedDoc, type Doc } from '../../persistence/index.js'
import { setBonusRuleEnabled, upsertBonusRule, type BonusRule } from '../bonus/index.js'
import type { BoostDef } from './types.js'

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<BoostDef[]> = persistedDoc<BoostDef[]>(store, 'boosts.defs', {
  version: 1,
  initial: [],
})

let defs: BoostDef[] = DOC.load() ?? []
let version = 0
const listeners = new Set<() => void>()

function notify(): void {
  DOC.save(defs)
  version += 1
  for (const l of listeners) l()
}

export function subscribeBoosts(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function getBoostsVersion(): number {
  return version
}
export function getBoosts(): BoostDef[] {
  return defs
}
export function getBoost(id: string): BoostDef | undefined {
  return defs.find((d) => d.id === id)
}
/** The enabled boosts (the only ones the settlement hook + previews consider). */
export function enabledBoosts(): BoostDef[] {
  return defs.filter((d) => d.enabled)
}

/**
 * The bonus rule a boost drives. Trigger is `manual` (inert — boosts are issued via the targeted
 * `grantRuleTo`, never `fireTrigger`, so they never fire on a blanket manual trigger; and with no
 * `refStakeCents` a stray manual fire would size to 0 and grant nothing). The reward is
 * `profit-boost` at the boost's pct — the engine multiplies it by the base the boost passes
 * (winnings for a profit boost, return for an odds boost) and caps it at maxWin.
 */
export function ruleForBoost(def: BoostDef): BonusRule {
  return {
    id: def.id,
    name: def.name,
    enabled: def.enabled,
    trigger: 'manual',
    reward: { kind: 'profit-boost', pct: def.pct },
    eligibility: def.eligibility,
    playthroughX: def.playthroughX,
    expiryMs: def.expiryMs,
    maxWinCents: def.maxWinCents,
  }
}

/** Create or replace a boost (manager authoring — callers gate on the manager role). */
export function upsertBoost(def: BoostDef): void {
  const i = defs.findIndex((d) => d.id === def.id)
  defs = i >= 0 ? defs.map((d) => (d.id === def.id ? def : d)) : [...defs, def]
  upsertBonusRule(ruleForBoost(def)) // keep the engine rule in lock-step
  notify()
}

/** Enable/disable a boost (and its engine rule) without re-authoring it. */
export function setBoostEnabled(id: string, enabled: boolean): void {
  defs = defs.map((d) => (d.id === id ? { ...d, enabled } : d))
  setBonusRuleEnabled(id, enabled)
  notify()
}

/**
 * Remove a boost. The bonus engine has no public rule-delete, so the companion rule is DISABLED
 * (it can never grant again). // SEAM: if the engine gains a rule-delete, call it here too.
 */
export function removeBoost(id: string): void {
  defs = defs.filter((d) => d.id !== id)
  setBonusRuleEnabled(id, false)
  notify()
}

const DAY = 86_400_000

/** Demo boosts so the panel reads as real. Display config only — authoring a boost moves no
 *  money; issuance happens at settlement once `armBoostEngine()` is called (opt-in). */
export function seedBoostsDemo(now: number): void {
  if (defs.length > 0) return
  void now
  const demo: BoostDef[] = [
    {
      id: 'boost-nba-sgp',
      name: 'NBA SGP Price Boost +20%',
      enabled: true,
      boostType: 'odds',
      pct: 20,
      maxWinCents: 5_000_00,
      playthroughX: 1,
      expiryMs: 7 * DAY,
      eligibility: {},
      qualifier: { sports: ['BASKETBALL'], sgpOnly: true, minLegs: 2 },
    },
    {
      id: 'boost-vip-profit',
      name: 'VIP Profit Boost +25%',
      enabled: true,
      boostType: 'profit',
      pct: 25,
      maxWinCents: 10_000_00,
      playthroughX: 1,
      expiryMs: 3 * DAY,
      eligibility: { tiers: ['gold', 'platinum', 'diamond'] },
      qualifier: { minLegs: 1 },
    },
  ]
  for (const d of demo) upsertBoost(d)
}

/** Test reset — clears the boost defs (callers also `__resetBonusEngine` for the rules). */
export function __resetBoosts(): void {
  defs = []
  version = 0
  notify()
}
