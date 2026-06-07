/**
 * The mock sportsbook feed (CLAUDE.md §4) — a stand-in for the live odds/scores
 * API. It walks the slate through a scripted timeline on a timer: each game sits
 * `upcoming`, kicks off to `live` with a score that climbs, then `final` at its
 * scripted result. After everything finals it loops, re-opening a fresh slate so
 * the demo runs forever.
 *
 * Swapping in the real API means writing another `SportsbookFeed` (provider.ts)
 * — this file is the only thing that knows the games are scripted. The store,
 * settlement, and UI can't tell the difference.
 */

import { EVENTS, type GameEvent, type MatchResult } from './markets.js'
import type { FeedHealth, SportsbookFeed } from './provider.js'

/** One game's scripted arc. Times are in feed ticks. */
interface Script {
  final: MatchResult
  /** Tick it goes live. */
  liveAfter: number
  /** Tick it finals. */
  finalAfter: number
  /** Number of periods (4 quarters, 3 NHL periods, 2 soccer halves). */
  periods: number
  /** Period prefix shown on the live clock (Q3, P2, 2H). */
  periodLabel: 'Q' | 'P' | 'H'
}

const SCRIPTS: Record<string, Script> = {
  'nba-lal-bos': { final: { home: 118, away: 110 }, liveAfter: 1, finalAfter: 4, periods: 4, periodLabel: 'Q' },
  'nba-gsw-den': { final: { home: 112, away: 121 }, liveAfter: 2, finalAfter: 6, periods: 4, periodLabel: 'Q' },
  'nfl-kc-buf': { final: { home: 27, away: 24 }, liveAfter: 3, finalAfter: 7, periods: 4, periodLabel: 'Q' },
  'nfl-sf-dal': { final: { home: 31, away: 17 }, liveAfter: 4, finalAfter: 9, periods: 4, periodLabel: 'Q' },
  'eul-oly-fcb': { final: { home: 84, away: 79 }, liveAfter: 2, finalAfter: 6, periods: 4, periodLabel: 'Q' },
  'epl-ars-mci': { final: { home: 1, away: 1 }, liveAfter: 2, finalAfter: 5, periods: 2, periodLabel: 'H' },
  'laliga-rma-fcb': { final: { home: 2, away: 1 }, liveAfter: 1, finalAfter: 4, periods: 2, periodLabel: 'H' },
  'ucl-bay-int': { final: { home: 1, away: 1 }, liveAfter: 3, finalAfter: 6, periods: 2, periodLabel: 'H' },
  'nhl-col-veg': { final: { home: 4, away: 2 }, liveAfter: 1, finalAfter: 5, periods: 3, periodLabel: 'P' },
}

/** Ticks a finished game stays on the board before the slate loops. */
const HOLD_TICKS = 3
/** Full cycle length: the last game's final + the lingering window. */
const CYCLE = Math.max(...Object.values(SCRIPTS).map((s) => s.finalAfter)) + HOLD_TICKS

/** Default real-time between ticks. ~5s keeps the slate lively but bettable. */
const DEFAULT_INTERVAL_MS = 5000

/** A short, realistic "connecting to the feed" beat before the first slate, so
 *  the loading UI is exercised even on the mock (a real API has its own). */
const CONNECT_MS = 600

/** The live state of one scripted game at cycle-tick `t`. Pure — easy to test. */
export function stateAt(
  s: Script,
  t: number,
): Pick<GameEvent, 'status' | 'score' | 'clock' | 'progress'> {
  if (t < s.liveAfter) return { status: 'upcoming' }
  if (t >= s.finalAfter) return { status: 'final', score: s.final, progress: 1 }

  const progress = (t - s.liveAfter) / (s.finalAfter - s.liveAfter) // 0 .. <1
  const score = {
    home: Math.round(s.final.home * progress),
    away: Math.round(s.final.away * progress),
  }
  const period = Math.min(s.periods, Math.floor(progress * s.periods) + 1)
  return { status: 'live', score, clock: `${s.periodLabel}${period}`, progress }
}

/** Apply the scripted state for tick `t` onto an event (unscripted → upcoming). */
function applyState(event: GameEvent, t: number): GameEvent {
  const script = SCRIPTS[event.id]
  if (!script) return { ...event, status: 'upcoming' }
  const { status, score, clock, progress } = stateAt(script, t % CYCLE)
  return { ...event, status, score, clock, progress }
}

export interface MockFeedOptions {
  intervalMs?: number
}

/** Create a mock feed that advances the slate on a timer (and loops forever). */
export function createMockFeed(opts: MockFeedOptions = {}): SportsbookFeed {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS
  let tick = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let connectTimer: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<(events: GameEvent[]) => void>()
  const healthListeners = new Set<(h: FeedHealth) => void>()

  let health: FeedHealth = { status: 'idle', lastUpdated: null }
  const setHealth = (next: FeedHealth) => {
    health = next
    healthListeners.forEach((l) => l(health))
  }

  const snapshot = () => EVENTS.map((e) => applyState(e, tick))
  const emit = () => {
    const slate = snapshot()
    listeners.forEach((l) => l(slate))
  }
  /** A confirmed update: push the current slate and stamp the feed live. */
  const confirm = () => {
    emit()
    setHealth({ status: 'live', lastUpdated: Date.now() })
  }

  return {
    snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getHealth: () => health,
    subscribeHealth(listener) {
      healthListeners.add(listener)
      return () => healthListeners.delete(listener)
    },
    start() {
      if (timer != null || connectTimer != null || typeof setInterval === 'undefined') return
      setHealth({ status: 'connecting', lastUpdated: null })
      connectTimer = setTimeout(() => {
        connectTimer = null
        confirm() // first confirmed slate → live
        timer = setInterval(() => {
          tick += 1
          confirm()
        }, intervalMs)
      }, CONNECT_MS)
    },
    stop() {
      if (connectTimer != null) clearTimeout(connectTimer)
      if (timer != null) clearInterval(timer)
      connectTimer = timer = null
      setHealth({ status: 'idle', lastUpdated: health.lastUpdated })
    },
  }
}
