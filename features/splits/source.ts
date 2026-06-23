/**
 * Public betting splits — the store-backed read side.
 *
 * It reads the live recorded bets (app/book/bets-store) and the org tree, applies the
 * downline-vs-global scope, and feeds the pure projection in splits.ts. It writes nothing
 * and holds no state of its own beyond re-exporting the bets store's subscribe/version for
 * React's useSyncExternalStore. The scope default + whether the toggle is offered come from
 * the shared Community Settings (the same source discovery uses).
 */

import { downline } from '../org/index.js'
import { getBook } from '../../app/book-store.js'
import { getBets, getBetsVersion, subscribeBets, type BookBet } from '../../app/book/bets-store.js'
import { communitySettings, type DiscoveryScope } from '../profile/community-settings.js'
import { marketSplits, mostBetMarkets, splitForMarket, toSplitBets } from './splits.js'
import type { MarketSplit, RankBy, RankedMarket, SplitBet } from './types.js'

/** Bets that represent real public action — everything actually placed and not voided.
 *  (A void carries no betting interest, so it never colours the public split.) */
function activeBets(bets: BookBet[]): BookBet[] {
  return bets.filter((b) => b.status !== 'void')
}

/**
 * The split rows in scope for a viewer:
 *  - `global`   — the whole tenant's action (the book is the tenant).
 *  - `downline` — only the viewer's downline subtree (their book beneath them).
 * A viewer who isn't in the org tree (e.g. a demo player with no tree position) sees the
 * tenant board — the scope is a public-stat LENS, not access control. Read-only; the
 * `downline` set is exact (no fall-back to global) so the scope is honest and testable;
 * the UI decides whether to OFFER the toggle (see `viewerHasDownline`).
 */
export function scopedSplitBets(
  viewerId: string,
  scope: DiscoveryScope,
  bets: BookBet[] = getBets(),
): SplitBet[] {
  const active = activeBets(bets)
  if (scope === 'global') return toSplitBets(active)
  const org = getBook()
  if (!org.members[viewerId]) return toSplitBets(active)
  const ids = new Set(downline(org, viewerId).map((m) => m.id))
  return toSplitBets(active.filter((b) => ids.has(b.accountId)))
}

/** Every market's split for a viewer/scope, keyed by marketId. */
export function marketSplitsFor(viewerId: string, scope: DiscoveryScope): Map<string, MarketSplit> {
  return marketSplits(scopedSplitBets(viewerId, scope))
}

/** One market's split for a viewer/scope (the inline-bar lookup), or null if no action. */
export function splitForMarketScoped(
  viewerId: string,
  scope: DiscoveryScope,
  marketId: string,
): MarketSplit | null {
  return splitForMarket(scopedSplitBets(viewerId, scope), marketId)
}

/** The most-bet markets for a viewer/scope (the discovery surface). */
export function mostBetMarketsFor(
  viewerId: string,
  scope: DiscoveryScope,
  opts: { by?: RankBy; limit?: number } = {},
): RankedMarket[] {
  return mostBetMarkets(scopedSplitBets(viewerId, scope), opts)
}

/** Whether a downline scope is meaningful for this viewer (in the tree + has anyone beneath). */
export function viewerHasDownline(viewerId: string): boolean {
  const org = getBook()
  return !!org.members[viewerId] && downline(org, viewerId).length > 0
}

/** The scope a viewer's splits surface opens at (per Community Settings). */
export function defaultSplitScope(): DiscoveryScope {
  return communitySettings().defaultScope
}

/** Whether the in-surface scope toggle is offered (operator may pin a scope). */
export function scopeToggleAllowed(): boolean {
  return communitySettings().allowScopeToggle
}

/** React store plumbing — splits change exactly when the recorded bets change. */
export { subscribeBets as subscribeSplits, getBetsVersion as splitsVersion }
