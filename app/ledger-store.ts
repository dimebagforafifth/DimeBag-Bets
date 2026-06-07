/**
 * The casino ledger — a running log of every resolved bet across all games.
 *
 * It subscribes to core's single resolution event (`onWagerResolved`), so it
 * captures every game automatically without any game knowing it exists. Each
 * entry is tagged with whichever game is on screen (the shell sets that on
 * navigation). Session-only (in-memory), matching the demo account that resets
 * on reload.
 */

import { onWagerResolved, type ResolveEvent } from '../core/index.js'
import { onReveal } from '../games/shared/reveal-bus.js'

export interface FeedEntry {
  id: number
  game: string
  gameKey: string
  /** Which player's figure moved — so the log can be filtered per player. */
  accountId: string
  /** Stake in cents. */
  stake: number
  /** Payout multiplier: 0 on a loss, 1 on a push/void, > 1 on a win. */
  multiplier: number
  /** Signed change to the figure, in cents (negative on a loss). */
  profit: number
  outcome: ResolveEvent['outcome']
  /** Epoch ms when it resolved. */
  time: number
}

/** The casino ledger grows up to this many recent bets (shared across every
 *  casino game), then drops the oldest. Hard cap so the in-memory log can't grow
 *  without bound. */
const MAX_ENTRIES = 1000

/**
 * Core resolves a bet the instant the math is decided, but each game then *plays
 * the outcome out* on screen (the wheel spins, the ball falls, the dealer draws).
 * Logging at resolve time would spoil the result before the player sees it.
 *
 * So instead of GUESSING how long each reveal takes, a game tells us exactly when
 * its reveal finishes by calling `signalReveal(accountId)` (see
 * games/shared/reveal-bus). The moment that fires, we release the bet's entry
 * after one tiny, near-imperceptible beat (`SPREAD_MS`). The spread isn't a real
 * wait — it just guarantees the figure moves *right after* the result lands on
 * screen, never before. This is what makes a variable reveal like Plinko's ball
 * fall (which scales with the row count) land on time at any board size.
 *
 * `FALLBACK_MS` is a per-game SAFETY ceiling: the worst-case reveal time. If a
 * signal never arrives — a game that doesn't emit one, or you navigate away
 * mid-animation — the entry still lands after this, so it's never lost and never
 * shown early. For games that already render their outcome synchronously and emit
 * no signal (cash-outs, instant showdowns) the fallback IS the normal path, set
 * to 0 so they settle after just the spread.
 *
 * The golden rule holds: **landing early is the bug; being a hair late is fine.**
 */
const SPREAD_MS = 25

const FALLBACK_MS: Record<string, number> = {
  // ---- animated reveals; the safety ceiling is the whole animation ----
  plinko: 2900, // slower hard-ball fall ~1.7–2.2s (signals on each land; this is just the safety ceiling)
  roulette: 4800, // SPIN_MS — wheel + ball settle land together
  cases: 4200, // OPEN_MS 4200 reel slide — the prize is readable right as it stops
  wheel: 3600, // SPIN_MS
  keno: 950, // numbers × 85ms reveal — signals the instant the last lands; this is only the ceiling
  diamonds: 600, // 5 gems × 120ms staggered in — the result is readable as the last lands
  sicbo: 1350, // dice settle one-by-one (~840ms) then a suspense beat before reveal (~1260ms); signals on reveal
  blackjack: 3600, // split (pair separates + two deals) then dealer draws to 17 — a high safety ceiling; the game signals the instant it's actually done
  coinflip: 1000, // safety ceiling only — the game signals on land (~0.8s toss) and on cash
  chickenroad: 840, // the bust roadkill slam + settle (wins signal immediately)
  baccarat: 2300, // card-by-card deal (up to 6 cards × 300ms + settle) — the game signals the instant the result lands; this is the safety ceiling
  pump: 620, // both win and pop signal explicitly now; this is only the exit-settle safety net
  limbo: 500, // CLIMB_MS — but signals the instant the number visually lands (~⅔ in), so this is only the ceiling
  dice: 40, // the roll value + win/loss are on screen the instant you roll; the flag's glide is just decoration, so log almost immediately (only a hair after, so the result has painted)
  hilo: 340, // the drawn card scales/rotates into place (wins signal immediately)

  // ---- outcome already on screen at resolve (static reveal ± a decorative
  //      flourish) — only the spread is needed ----
  crash: 0, // you cashed out / it crashed — the multiplier is already shown
  mines: 0, // the hit bomb / cashed gems are drawn the instant you act
  'dragon-tower': 0, // the deciding tile's art renders synchronously
  threecardpoker: 760, // dealer turns 3 cards one at a time (~760ms); the showdown is readable as the last flip lands
  videopoker: 950, // cards roll in (up to ~640ms) then the win popup beat — signals on draw; this is the safety ceiling
}
// Unknown keys (e.g. sportsbook grades) have no reveal animation — the result is
// known at grade time — so they just get the spread.
const DEFAULT_FALLBACK_MS = 0

let entries: FeedEntry[] = []
let seq = 0
let active = { key: 'casino', name: 'Casino' }
const listeners = new Set<() => void>()

// Entries that have resolved but aren't shown yet — waiting on their game's reveal
// signal (or the safety fallback). Kept in resolve order so a game's signal
// releases its OLDEST outstanding bet first (e.g. Plinko balls land in drop order).
interface Pending {
  entry: FeedEntry
  timer: ReturnType<typeof setTimeout> // the safety-fallback timer
}
let pendingList: Pending[] = []

/** The shell tags new entries with whatever game is currently open. Switching the
 *  active game also means we've LEFT the previous one — flush its still-held bets
 *  (see flushGame) so a bet dropped right before you click out lands in the log and
 *  lifts the lock immediately, instead of lingering on its safety timer. */
export function setActiveGame(key: string, name: string): void {
  if (key !== active.key) flushGame(active.key)
  active = { key, name }
}

/** Whatever game is on screen right now — read by the durable book ledger
 *  (app/book-ledger) to tag each resolved bet with the game it came from. */
export function getActiveGame(): { key: string; name: string } {
  return active
}

/**
 * Settle every entry still held for `gameKey` right now — used when the player
 * navigates AWAY from that game. The reveal hold exists only to avoid spoiling an
 * on-screen result before the player sees it; once you've left the game there's
 * nothing left on screen to spoil, so its in-flight bets (e.g. a Plinko ball
 * dropped the instant before you clicked out) should post to the log at once and
 * release the resolving lock — not wait out each per-game safety fallback. The
 * figure already moved at resolve time (core credited it); this just makes the
 * VISIBLE record catch up immediately so leaving never feels like a forfeit.
 */
function flushGame(gameKey: string): void {
  // Snapshot first: claim() mutates pendingList, so iterate a stable copy.
  for (const p of pendingList.filter((x) => x.entry.gameKey === gameKey)) {
    claim(p)
    show(p)
  }
}

/** Current entries, newest first. Stable ref between changes (for useSyncExternalStore). */
export function getLedger(): FeedEntry[] {
  return entries
}

export function clearLedger(): void {
  entries = []
  notify()
}

export function subscribeLedger(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify(): void {
  listeners.forEach((l) => l())
}

/** Add a pending entry to the visible ledger (newest first). */
function show(p: Pending): void {
  entries = [p.entry, ...entries].slice(0, MAX_ENTRIES)
  notify()
}

/** Take a pending entry off the waiting list and cancel its fallback timer, so it
 *  resolves exactly once and a later signal moves on to the next bet. */
function claim(p: Pending): void {
  pendingList = pendingList.filter((x) => x !== p)
  clearTimeout(p.timer)
}

// Record every resolution — registered once, on first import. The entry is built
// now (tagged with the game that resolved it) and held in `pending` until that
// game signals its reveal has finished; the fallback timer is a safety net so an
// entry is never lost if the signal never comes.
onWagerResolved((e: ResolveEvent) => {
  seq += 1
  const entry: FeedEntry = {
    id: seq,
    game: active.name,
    gameKey: active.key,
    accountId: e.accountId,
    stake: e.stake,
    multiplier: e.payoutMultiplier,
    profit: e.profit,
    outcome: e.outcome,
    time: Date.now(),
  }
  const fallback = (FALLBACK_MS[entry.gameKey] ?? DEFAULT_FALLBACK_MS) + SPREAD_MS
  const p: Pending = {
    entry,
    timer: setTimeout(() => {
      claim(p)
      show(p)
    }, fallback),
  }
  pendingList.push(p)
  // We deliberately do NOT engage the cross-game "resolving" lock here. The ledger
  // holds the LOG entry above (anti-spoiler), but a player must be able to place
  // the next bet the INSTANT the result is on screen. Every game already gates its
  // own Play/Bet button on its LOCAL reveal state (a spinning/dealing/revealing
  // flag folded into betInvalid, or its round status), so the button re-enables
  // exactly when the result shows. Engaging the lock here re-coupled betting to
  // this anti-spoiler fallback timer, leaving the button disabled for the whole
  // per-game safety-ceiling AFTER the result was already visible — that was the
  // cross-board "delay before the next bet." Keeping it disengaged is what stops
  // that from ever returning; see app/ledger-no-throttle.test.ts.
})

// A game announced its reveal just finished: release that player's oldest
// outstanding bet in the game currently on screen, after only the tiny spread.
// Claiming it immediately means simultaneous signals (e.g. several Plinko balls
// landing at once) each release a DISTINCT bet, and a stale entry left pending
// from a game you've navigated away from is never released early — it waits for
// its own fallback instead.
onReveal((accountId: string) => {
  const p = pendingList.find(
    (x) => x.entry.accountId === accountId && x.entry.gameKey === active.key,
  )
  if (!p) return
  claim(p)
  setTimeout(() => show(p), SPREAD_MS)
})
