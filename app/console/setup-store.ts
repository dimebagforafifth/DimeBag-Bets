/**
 * Setup state — a tiny persisted record of whether the new-manager wizard has been
 * run, which preset was applied, and the starter promo templates the operator kept for
 * reference. Same external-store blueprint as the other app/* stores; namespace
 * 'dimebag'. Holds no money and no roles.
 */

import { createLocalStore, persistedDoc, type Doc } from '../../persistence/index.js'
import type { PresetKey, PromoTemplate } from './presets.js'

export interface SetupState {
  completed: boolean
  preset: PresetKey | null
  /** Epoch ms the wizard last applied a preset (0 = never). */
  appliedAt: number
  /** Starter promo templates surfaced for the operator to run from Promotions. */
  promoTemplates: PromoTemplate[]
}

const DEFAULTS: SetupState = { completed: false, preset: null, appliedAt: 0, promoTemplates: [] }

const store = createLocalStore({ namespace: 'dimebag' })
const DOC: Doc<SetupState> = persistedDoc<SetupState>(store, 'console.setup', {
  version: 1,
  initial: DEFAULTS,
})

let state: SetupState = { ...DEFAULTS, ...DOC.load() }
const listeners = new Set<() => void>()
let version = 0

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeSetup(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSetupVersion(): number {
  return version
}

export function getSetup(): SetupState {
  return state
}

/** Record that the wizard applied `preset` (and the promos kept), at `at` (epoch ms). */
export function completeSetup(
  preset: PresetKey,
  promoTemplates: PromoTemplate[],
  at: number,
): void {
  state = { completed: true, preset, appliedAt: at, promoTemplates }
  DOC.save(state)
  notify()
}

/** Test/SSR helper: clear setup state. */
export function __resetSetup(): void {
  state = { ...DEFAULTS }
  DOC.save(state)
  notify()
}
