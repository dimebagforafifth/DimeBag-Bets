/**
 * The economy-mode React seam — the ONE context every surface reads to reconfigure between
 * the credit and balance economies (CLAUDE.md §3).
 *
 * `useEconomyMode()` / `useEconomyConfig()` subscribe to the persisted tenant config (which
 * `economy-config` keeps in step with core's policy), so the player wallet, the management
 * tiles, and the games all render the same mode without prop-drilling. `<ModeGate>` shows its
 * children only in the named mode — the declarative way a credit-only surface hides (or swaps
 * to a balance-mode equivalent) without scattering `if (mode === …)` everywhere.
 *
 * // SEAM (Lanes C, D): import `useEconomyMode` + `ModeGate` from here. The Challenges stake
 * surface reads the mode to label the wallet; the balance-import flow reads it to seed wallets.
 */
import { type ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import type { EconomyMode } from '../core/index.js'
import {
  getEconomyMode,
  getEconomyConfig,
  getEconomyConfigVersion,
  subscribeEconomyConfig,
  type TenantEconomyConfig,
} from './economy-config.js'

/** The active book's economy mode, re-rendering on any change. */
export function useEconomyMode(): EconomyMode {
  useSyncExternalStore(subscribeEconomyConfig, getEconomyConfigVersion, getEconomyConfigVersion)
  return getEconomyMode()
}

/** The full tenant economy config (mode + floor + default credit line + flip metadata). */
export function useEconomyConfig(): TenantEconomyConfig {
  useSyncExternalStore(subscribeEconomyConfig, getEconomyConfigVersion, getEconomyConfigVersion)
  return getEconomyConfig()
}

/** Convenience: true when the book runs the non-default balance (wallet) economy. */
export function useIsBalanceMode(): boolean {
  return useEconomyMode() === 'balance'
}

/**
 * Render `children` only in the named economy mode (else `fallback`). The declarative gate a
 * credit-only tile uses to hide in balance mode — or to swap copy:
 *   <ModeGate mode="credit">Credit available</ModeGate>
 *   <ModeGate mode="balance">Available balance</ModeGate>
 */
export function ModeGate({
  mode,
  children,
  fallback = null,
}: {
  mode: EconomyMode
  children: ReactNode
  fallback?: ReactNode
}) {
  const current = useEconomyMode()
  return <>{current === mode ? children : fallback}</>
}
