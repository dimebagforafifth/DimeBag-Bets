/**
 * Economy-mode seam (Lane A interlock).
 *
 * Lane A owns the real `useEconomyMode()` + `<ModeGate>` (the app-wide credits/economy posture).
 * Until the wiring pass repoints this module at Lane A's, the default below keeps the Challenges
 * stake surface fully functional in standard credits mode — byte-identical to today's behaviour.
 *
 * The stake surface is MODE-AWARE: it reads `useEconomyMode()` for the label and wraps every
 * real-stake action (propose / accept) in `<ModeGate>` so a mode that pauses staking shows an
 * explanation instead of letting credits move.
 *
 * // SEAM (wiring pass): replace the two impls below with a re-export of Lane A's hook +
 *   component, e.g. `export { useEconomyMode, ModeGate } from '../app/economy-mode.js'`. The
 *   CONTRACT the stake surface relies on: `useEconomyMode()` → { id, label, stakingEnabled, note? };
 *   `<ModeGate>` renders its children when staking is enabled, else its `fallback`.
 */

import type { ReactNode } from 'react'

export interface EconomyMode {
  /** Mode id, e.g. 'credits'. */
  id: string
  /** Short display label, e.g. 'Credits'. */
  label: string
  /** Whether real-stake actions (propose / accept) may move credits in this mode. */
  stakingEnabled: boolean
  /** Optional note shown when staking is paused in this mode. */
  note?: string
}

/** The default mode: standard credits, staking enabled (no behaviour change without Lane A). */
const DEFAULT_MODE: EconomyMode = { id: 'credits', label: 'Credits', stakingEnabled: true }

let current: EconomyMode = DEFAULT_MODE

/** The active economy mode. (Lane A replaces this with a reactive hook; the default is static.) */
export function useEconomyMode(): EconomyMode {
  return current
}

/** Test / preview hook: set the mode (null restores the default). Lane A's module supersedes this. */
export function __setEconomyMode(mode: EconomyMode | null): void {
  current = mode ?? DEFAULT_MODE
}

/** Renders `children` only when the active mode allows staking; otherwise `fallback`. */
export function ModeGate({
  children,
  fallback = null,
}: {
  children: ReactNode
  fallback?: ReactNode
}): ReactNode {
  const mode = useEconomyMode()
  return <>{mode.stakingEnabled ? children : fallback}</>
}
