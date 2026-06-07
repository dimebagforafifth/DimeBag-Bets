import { useSyncExternalStore } from 'react'
import { isResolving, subscribeResolving } from './reveal-bus.js'

/**
 * True while the player has a bet that has resolved but whose result is still
 * playing out (the reveal animation + ledger posting). Gate a game's Play/Bet
 * button on this — `disabled={betInvalid || resolving}` — so the next round can't
 * start until the current result is fully shown and logged, never while a loss
 * the player hasn't seen yet is mid-reveal.
 */
export function useResolving(accountId: string): boolean {
  return useSyncExternalStore(
    subscribeResolving,
    () => isResolving(accountId),
    () => false,
  )
}
