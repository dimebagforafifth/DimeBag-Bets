/**
 * Live activity feed — pure logic (CLAUDE.md §2). Turns the session ledger's
 * resolved-bet entries into a compact, newest-first stream of "who just bet what,
 * and the big wins". Read-only: it never moves money or touches core — it only
 * shapes existing ledger events for display, and it reads the SESSION feed
 * (app/ledger-store), which is already release-timed so a result never shows in
 * the ticker before the player who made it has seen it. The component
 * (app/ActivityTicker) subscribes to that feed + the book and renders these.
 */

import type { FeedEntry } from './ledger-store.js'
import type { Outcome } from '../core/index.js'

export interface TickerItem {
  /** The feed entry id — a stable React key. */
  id: number
  /** Display name of the player whose figure moved. */
  player: string
  /** The product the bet was placed on (game name, or "Sportsbook"). */
  game: string
  gameKey: string
  outcome: Outcome
  /** Stake in cents. */
  stake: number
  /** Signed change to the figure in cents (negative on a loss). */
  profit: number
  /** Payout multiplier (0 loss, 1 push/void, >1 win). */
  multiplier: number
  /** A notable win — emphasised in the feed. */
  big: boolean
  /** Epoch ms it resolved. */
  at: number
}

export interface TickerOptions {
  /** Max items to keep. */
  limit?: number
  /** A win returning at least this many cents of profit is "big". */
  bigWinCents?: number
  /** ...or a win at or above this multiplier is "big". */
  bigMultiplier?: number
  /** Keep only winning bets (drop losses, pushes, voids). */
  winsOnly?: boolean
  /** Ordering: 'recent' = newest first (default); 'largest' = biggest profit first. */
  sort?: 'recent' | 'largest'
}

const DEFAULTS = { limit: 12, bigWinCents: 5_000, bigMultiplier: 10 }

/** Is a resolved entry a "big win"? Pure, exported for the component + tests. */
export function isBigWin(
  item: { outcome: Outcome; profit: number; multiplier: number },
  o: TickerOptions = {},
): boolean {
  const bigWinCents = o.bigWinCents ?? DEFAULTS.bigWinCents
  const bigMultiplier = o.bigMultiplier ?? DEFAULTS.bigMultiplier
  return item.outcome === 'win' && (item.profit >= bigWinCents || item.multiplier >= bigMultiplier)
}

/**
 * Shape session feed entries into ticker items. `names` maps an accountId to a display
 * name; unknown accounts fall back to a neutral label. With `winsOnly`, losses/pushes/voids
 * are dropped (filtered BEFORE the limit, so a window of small wins isn't crowded out by
 * losses). `sort: 'largest'` orders by biggest profit first (tie-break newest); the default
 * 'recent' preserves the feed's newest-first order. The `limit` is applied last.
 */
export function toTickerItems(
  feed: readonly FeedEntry[],
  names: ReadonlyMap<string, string>,
  opts: TickerOptions = {},
): TickerItem[] {
  const limit = opts.limit ?? DEFAULTS.limit
  const winsOnly = opts.winsOnly ?? false
  const sort = opts.sort ?? 'recent'
  const items: TickerItem[] = []
  // `feed` is newest-first already.
  for (const e of feed) {
    if (winsOnly && e.outcome !== 'win') continue
    items.push({
      id: e.id,
      player: names.get(e.accountId) ?? 'A player',
      game: e.game,
      gameKey: e.gameKey,
      outcome: e.outcome,
      stake: e.stake,
      profit: e.profit,
      multiplier: e.multiplier,
      big: isBigWin(e, opts),
      at: e.time,
    })
  }
  // 'largest' = biggest profit first, ties broken by most recent; 'recent' keeps feed order.
  if (sort === 'largest') items.sort((a, b) => b.profit - a.profit || b.at - a.at)
  return items.slice(0, limit)
}
