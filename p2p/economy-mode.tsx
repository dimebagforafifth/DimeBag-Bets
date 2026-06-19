/**
 * Economy-mode seam (Lane A interlock) — REPOINTED at Lane A's app/economy-mode in the wiring
 * pass.
 *
 * Lane A owns the real app-wide economy posture as a string mode ('credit' | 'balance'). The
 * Challenges stake surface wants a small descriptor { id, label, stakingEnabled, note? } to
 * label the wallet chip and gate staking. This thin ADAPTER maps Lane A's live mode into that
 * shape — staking is enabled in BOTH real economies (credit and balance both let credits move),
 * so the surface simply relabels (Credits ↔ Wallet) with the book's mode. Off-by-default: the
 * default mode is 'credit' → { label: 'Credits', stakingEnabled: true }, byte-identical to the
 * old stub's behaviour.
 *
 * `__setEconomyMode` stays as a test/preview OVERRIDE (e.g. to exercise a staking-paused mode);
 * when no override is set, Lane A's live mode wins, so the surface tracks the real book.
 */

import { type ReactNode } from 'react'
import { useEconomyMode as useCoreEconomyMode } from '../app/economy-mode.js'

export interface EconomyMode {
  /** Mode id, e.g. 'credit' | 'balance'. */
  id: string
  /** Short display label, e.g. 'Credits' / 'Wallet'. */
  label: string
  /** Whether real-stake actions (propose / accept) may move credits in this mode. */
  stakingEnabled: boolean
  /** Optional note shown when staking is paused in this mode. */
  note?: string
}

/** Map Lane A's string mode → the stake-surface descriptor. Staking is enabled in both real
 *  economies; only a test/preview override (below) can pause it. */
function fromCore(mode: 'credit' | 'balance'): EconomyMode {
  return mode === 'balance'
    ? { id: 'balance', label: 'Wallet', stakingEnabled: true }
    : { id: 'credit', label: 'Credits', stakingEnabled: true }
}

/** A test/preview override; when set it wins over Lane A's live mode. */
let override: EconomyMode | null = null

/** The active economy mode for the stake surface — the override if set, else Lane A's live mode. */
export function useEconomyMode(): EconomyMode {
  const core = useCoreEconomyMode() // reactive — Lane A subscribes via useSyncExternalStore
  return override ?? fromCore(core)
}

/** Test / preview hook: force a mode (null restores tracking of Lane A's live mode). */
export function __setEconomyMode(mode: EconomyMode | null): void {
  override = mode
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
