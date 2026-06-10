/**
 * Operator alerts — things worth the manager's attention right now: exposure over the
 * cap, a player near their credit line, an unusually big win, or a large open position.
 * Pure (no singletons): the panel feeds it the live ledger rows + org + exposure +
 * thresholds + a money formatter. Reuses risk.checkAlerts read-only for the credit /
 * exposure rules and adds win/pending watches. Moves no money.
 *
 * Every alert is TAGGED with a `type` (credit | exposure | win | pending) and, where a
 * single player is implicated, their `playerId` — so the panel can show counts-by-type,
 * filter, and offer per-player quick actions (suspend / lock / adjust credit) without
 * re-parsing the human-readable message. These fields are ADDITIVE; messages + severity
 * are unchanged.
 */

import { creditUtilization, membersByRole, type Org } from '../../org/index.js'
import { checkAlerts, type RiskThresholds } from '../risk.js'
import type { BetRow } from '../ledger-stats.js'

const DAY = 86_400_000

/** The machine-readable kind of an alert (drives the counts bar + filters). */
export type AlertType = 'credit' | 'exposure' | 'win' | 'pending'

/** The filter selections the panel offers — `'all'` plus one per real type. */
export type AlertFilter = 'all' | AlertType

export interface OperatorAlert {
  id: string
  severity: 'warn' | 'info'
  message: string
  /** What kind of signal this is — for counts, filtering, and quick actions. */
  type: AlertType
  /** The player this alert is about, when exactly one is implicated (credit / win /
   *  pending). Absent for book-wide signals (exposure). */
  playerId?: string
}

export interface AlertInputs {
  org: Org
  /** Recent resolved bets (durable ledger → toBetRows). */
  rows: BetRow[]
  /** Live open exposure in cents (totalOpenExposure()). */
  exposure: number
  thresholds: RiskThresholds
  money: (cents: number) => string
  now: number
  /** A single win at/above this (cents) is flagged. Default $200. */
  bigWinCents?: number
  /** A player's open stake at/above this (cents) is flagged. Default $500. */
  largePendingCents?: number
}

export function buildOperatorAlerts(inp: AlertInputs): OperatorAlert[] {
  const { org, rows, exposure, thresholds, money, now } = inp
  const bigWin = inp.bigWinCents ?? 20_000
  const largePending = inp.largePendingCents ?? 50_000
  const alerts: OperatorAlert[] = []

  // Credit-utilization + exposure-cap rules (reused from the risk lane). checkAlerts
  // emits the per-player credit breaches first (in membersByRole order), then the
  // single optional exposure-cap alert last — so we tag by re-deriving that same set
  // rather than re-parsing the message (messages stay byte-identical).
  const overCredit = membersByRole(org, 'player').filter(
    (p) => creditUtilization(p) >= thresholds.creditUtil,
  )
  checkAlerts(org, thresholds, money, exposure).forEach((a, i) => {
    const credited = overCredit[i]
    if (credited) {
      alerts.push({ id: `risk:${i}`, severity: a.severity, message: a.message, type: 'credit', playerId: credited.id })
    } else {
      alerts.push({ id: `risk:${i}`, severity: a.severity, message: a.message, type: 'exposure' })
    }
  })

  // Big wins in the last 24h.
  const since = now - DAY
  for (const r of rows) {
    if (r.time >= since && r.profit >= bigWin) {
      const name = org.members[r.accountId]?.name ?? r.accountId
      alerts.push({
        id: `win:${r.id}`,
        severity: 'info',
        message: `${name} won ${money(r.profit)} on ${r.game}`,
        type: 'win',
        playerId: org.members[r.accountId] ? r.accountId : undefined,
      })
    }
  }

  // Large open positions.
  for (const p of membersByRole(org, 'player')) {
    if (p.account.pending >= largePending) {
      alerts.push({
        id: `pend:${p.id}`,
        severity: 'warn',
        message: `${p.name} has ${money(p.account.pending)} at risk`,
        type: 'pending',
        playerId: p.id,
      })
    }
  }

  return alerts
}

/** Display order + label for each alert type (drives the counts bar and the filter
 *  chips). Kept here so the panel and any future consumer agree on naming. */
export const ALERT_TYPE_META: ReadonlyArray<{ type: AlertType; label: string }> = [
  { type: 'credit', label: 'credit' },
  { type: 'exposure', label: 'exposure' },
  { type: 'win', label: 'wins' },
  { type: 'pending', label: 'pending' },
]

export interface AlertCounts {
  total: number
  warn: number
  info: number
  /** Count per type, always present (0 when none) so the summary bar is stable. */
  byType: Record<AlertType, number>
}

/** Tally alerts by type and severity for the quick book-health scan bar. Pure. */
export function summarizeAlerts(alerts: OperatorAlert[]): AlertCounts {
  const byType: Record<AlertType, number> = { credit: 0, exposure: 0, win: 0, pending: 0 }
  let warn = 0
  let info = 0
  for (const a of alerts) {
    byType[a.type] += 1
    if (a.severity === 'warn') warn += 1
    else info += 1
  }
  return { total: alerts.length, warn, info, byType }
}

/** Apply a type filter (`'all'` passes everything). Pure — used by the panel's live
 *  matched count and the rendered list alike, so they never disagree. */
export function filterAlerts(alerts: OperatorAlert[], filter: AlertFilter): OperatorAlert[] {
  return filter === 'all' ? alerts : alerts.filter((a) => a.type === filter)
}
