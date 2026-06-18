/**
 * The verified-record derivation engine (round 2, Agent B).
 *
 * PURE + READ-ONLY. Every function here takes settled BetRow[] (adapted from the durable,
 * append-only ledger of core resolutions) and returns derived facts. It imports no store,
 * holds no state, and has NO path to mutate money, the ledger, the org, or a record. That is
 * the integrity guarantee: a record is a deterministic projection of settled outcomes core
 * itself produced — there is no setter a player or agent could call to inflate it.
 *
 * Reuses the existing ledger-stats helpers (summarize/byGame/isSportsbook) rather than
 * re-deriving them; adds what records needs on top: ROI, pushes, streaks, biggest loss,
 * per-period windows, and a reproducible fingerprint.
 */

import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'
import { byGame, isSportsbook, type BetRow } from '../app/ledger-stats.js'
import type { RankProgress } from '../vip/index.js'
import { clvSummary } from './clv.js'
import { deriveBadges } from './badges.js'
import type { BetHighlight, PeriodStats, RecordInput, StreakInfo, VerifiedRecord } from './types.js'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const MONTH_MS = 30 * DAY_MS

/** Decided = a real win or loss. Push/void are no-action (stake returned) and never count. */
function isDecided(outcome: BetRow['outcome']): boolean {
  return outcome === 'win' || outcome === 'loss'
}

/** Settled-activity summary over an arbitrary set of bets. Pure. */
export function periodStats(rows: BetRow[]): PeriodStats {
  let wagered = 0
  let net = 0
  let wins = 0
  let losses = 0
  let pushes = 0
  for (const r of rows) {
    wagered += r.stake
    net += r.profit
    if (r.outcome === 'win') wins++
    else if (r.outcome === 'loss') losses++
    else pushes++ // push | void
  }
  const decided = wins + losses
  return {
    bets: rows.length,
    wagered,
    net,
    wins,
    losses,
    pushes,
    decided,
    winRate: decided ? (wins / decided) * 100 : 0,
    roi: wagered ? net / wagered : 0,
  }
}

/** Bets settled within `windowMs` of `now`. */
export function withinPeriod(rows: BetRow[], now: number, windowMs: number): BetRow[] {
  const cutoff = now - windowMs
  return rows.filter((r) => r.time >= cutoff)
}

/**
 * Current + longest win/loss streaks. Pushes/voids are skipped (no-action), so e.g.
 * W, push, W reads as a 2-win streak. Input order is irrelevant — we sort chronologically.
 */
export function streaks(rows: BetRow[]): StreakInfo {
  const decided = rows
    .filter((r) => isDecided(r.outcome))
    .slice()
    .sort((a, b) => a.time - b.time || a.id - b.id)

  let longestWin = 0
  let longestLoss = 0
  let runKind: 'win' | 'loss' | null = null
  let runLen = 0
  for (const r of decided) {
    if (r.outcome === runKind) {
      runLen++
    } else {
      runKind = r.outcome as 'win' | 'loss'
      runLen = 1
    }
    if (runKind === 'win') longestWin = Math.max(longestWin, runLen)
    else longestLoss = Math.max(longestLoss, runLen)
  }

  // Current streak = the trailing run (the last `runKind`/`runLen` computed above).
  if (decided.length === 0 || runKind === null) {
    return { current: 0, currentKind: 'none', longestWin, longestLoss }
  }
  return { current: runLen, currentKind: runKind, longestWin, longestLoss }
}

function toHighlight(r: BetRow): BetHighlight {
  return {
    id: r.id,
    gameKey: r.gameKey,
    game: r.game,
    stake: r.stake,
    multiplier: r.multiplier,
    profit: r.profit,
    outcome: r.outcome,
    time: r.time,
  }
}

/** Biggest single win (max profit > 0) and biggest single loss (min profit < 0). */
export function highlights(rows: BetRow[]): {
  biggestWin: BetHighlight | null
  biggestLoss: BetHighlight | null
} {
  let win: BetRow | null = null
  let loss: BetRow | null = null
  for (const r of rows) {
    if (r.profit > 0 && (!win || r.profit > win.profit)) win = r
    if (r.profit < 0 && (!loss || r.profit < loss.profit)) loss = r
  }
  return {
    biggestWin: win ? toHighlight(win) : null,
    biggestLoss: loss ? toHighlight(loss) : null,
  }
}

/**
 * A reproducible digest of the settled rows a record was derived from. Sorted by ledger seq
 * so it is order-independent; anyone with the same settled rows recomputes the same hash.
 * This is what makes the record tamper-EVIDENT: it pins the record to specific ledger
 * resolutions. (It is an integrity primitive, not a security boundary on its own — that
 * arrives when the ledger is server-authoritative; see the records README / SEAM notes.)
 */
export function fingerprint(rows: BetRow[]): string {
  const canonical = rows
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((r) => `${r.id}:${r.outcome}:${r.stake}:${r.multiplier}:${r.profit}:${r.time}`)
    .join('|')
  return bytesToHex(sha256(utf8ToBytes(canonical))).slice(0, 32)
}

/**
 * Assemble the full verified record from settled rows. `tierFor` maps the VERIFIED lifetime
 * wagered to a VIP-ladder standing (injected so this stays pure/testable; the store wires the
 * real vip ladder). Reuses byGame/isSportsbook for splits.
 */
export function buildRecord(
  input: RecordInput,
  tierFor: (wagered: number) => RankProgress,
): VerifiedRecord {
  const { rows, now } = input
  const lifetime = periodStats(rows)
  const casinoRows = rows.filter((r) => !isSportsbook(r))
  const sportsRows = rows.filter(isSportsbook)
  const { biggestWin, biggestLoss } = highlights(rows)
  const recentBets = rows
    .slice()
    .sort((a, b) => b.time - a.time || b.id - a.id)
    .slice(0, 8)
    .map(toHighlight)

  const record: VerifiedRecord = {
    accountId: input.accountId,
    name: input.name,
    lifetime,
    periods: {
      day: periodStats(withinPeriod(rows, now, DAY_MS)),
      week: periodStats(withinPeriod(rows, now, WEEK_MS)),
      month: periodStats(withinPeriod(rows, now, MONTH_MS)),
    },
    streak: streaks(rows),
    biggestWin,
    biggestLoss,
    byGame: byGame(rows),
    side: { casino: periodStats(casinoRows), sportsbook: periodStats(sportsRows) },
    clv: clvSummary(input.clv),
    tier: tierFor(lifetime.wagered),
    badges: [], // filled below (needs the assembled record)
    recentBets,
    integrity: {
      source: 'settled-ledger',
      entriesConsidered: rows.length,
      demoSeeded: input.demoSeeded,
      fingerprint: fingerprint(rows),
    },
  }
  record.badges = deriveBadges(record)
  return record
}
