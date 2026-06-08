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
  /** Max items to keep (newest first). */
  limit?: number
  /** A win returning at least this many cents of profit is "big". */
  bigWinCents?: number
  /** ...or a win at or above this multiplier is "big". */
  bigMultiplier?: number
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
 * Shape session feed entries into ticker items, newest first. `names` maps an
 * accountId to a display name; unknown accounts fall back to a neutral label.
 * Every feed entry is a graded bet already, so there is nothing to filter out.
 */
export function toTickerItems(
  feed: readonly FeedEntry[],
  names: ReadonlyMap<string, string>,
  opts: TickerOptions = {},
): TickerItem[] {
  const limit = opts.limit ?? DEFAULTS.limit
  const out: TickerItem[] = []
  // `feed` is newest-first already; stop once we have enough.
  for (const e of feed) {
    out.push({
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
    if (out.length >= limit) break
  }
  return out
}
