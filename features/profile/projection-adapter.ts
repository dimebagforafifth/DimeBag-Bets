/**
 * The DEFAULT projection source — derives `ProfileStats` from the existing read-only layers:
 *   - records/  (getRecord) for the verified headline: windowed W/L, ROI, streak, biggest win,
 *     CLV, VIP tier, badges — itself a pure projection of the durable ledger.
 *   - app/ledger-stats + app/book-ledger for the raw settled rows → units + the cumulative-P&L
 *     curve (the SAME rows records uses, so the curve reconciles to the headline net).
 *   - app/book/bets-store for by-sport / by-market splits — live sportsbook detail, "where data
 *     exists" (it isn't in the money-only durable ledger).
 *
 * This module mutates NOTHING and imports no money path. // SEAM (Lane A / wiring): replace this
 * source with `player_profile_stats_mv` via `setProfileProjectionSource` — same `ProfileStats`
 * shape, so no surface changes.
 */

import { toBetRows } from '../../app/ledger-stats.js'
import { getBookLedger } from '../../app/book-ledger.js'
import { getBets } from '../../app/book/bets-store.js'
import { getRecord, isDemoProfile, listProfilePlayers, seededRows } from '../records/index.js'
import {
  installDefaultProjectionSource,
  type ProfileProjectionSource,
  type ProfileStats,
  type TailSuccess,
} from './projection.js'
import { gameSplits, marketSplits, pnlFromRows, sportSplits, unitsFromRows } from './derive.js'

/**
 * The exact row set the verified record is built from: the account's durable settled rows plus
 * its demo-seed rows when (and only when) records is in demo/seed mode for that account. Mirrors
 * records/store.getRecord so units + the P&L curve match the record's headline net.
 */
function recordRows(accountId: string, now: number) {
  const real = toBetRows(getBookLedger(), accountId)
  const seed = isDemoProfile(accountId) ? seededRows(accountId, now) : []
  return [...real, ...seed]
}

/** A player's settled (non-open) sportsbook bets — the only input the splits need. */
function settledBetsFor(accountId: string) {
  return getBets().filter((b) => b.accountId === accountId && b.status !== 'open')
}

/**
 * Tail-success rate. Honestly gated: the book doesn't stamp tail provenance on a placed bet yet,
 * so this reports unavailable. // SEAM (wiring): compute from tagged tails once tail/fade marks
 * the bets it places, or read it off Lane A's mv.
 */
function tailSuccessFor(_accountId: string): TailSuccess {
  return {
    available: false,
    tails: 0,
    settled: 0,
    wins: 0,
    successRate: 0,
    note: 'Available once tailed bets are tagged.',
  }
}

export const recordsBackedSource: ProfileProjectionSource = {
  statsFor(accountId: string, now: number): ProfileStats {
    const rec = getRecord(accountId, now)
    const rows = recordRows(accountId, now)
    const settled = settledBetsFor(accountId)
    return {
      accountId,
      name: rec.name,
      lifetime: rec.lifetime,
      periods: rec.periods,
      units: unitsFromRows(rows),
      netCents: rec.lifetime.net,
      biggestWin: rec.biggestWin,
      streak: rec.streak,
      pnl: pnlFromRows(rows),
      bySport: sportSplits(settled),
      byMarket: marketSplits(settled),
      byGame: gameSplits(rows),
      clv: rec.clv,
      tailSuccess: tailSuccessFor(accountId),
      tier: rec.tier,
      badges: rec.badges,
      demoSeeded: rec.integrity.demoSeeded,
    }
  },
  listProfiles() {
    return listProfilePlayers()
  },
}

// Register as the fallback the moment this module is imported (the mock/local default). The
// wiring pass calls setProfileProjectionSource(laneAMv) afterwards to override it.
installDefaultProjectionSource(recordsBackedSource)
