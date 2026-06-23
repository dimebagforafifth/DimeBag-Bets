/**
 * Operator alerts — things worth the manager's attention right now: exposure over the
 * cap, a player near their credit line, an unusually big win, or a large open position.
 * Pure (no singletons): the panel feeds it the live ledger rows + org + exposure +
 * thresholds + a money formatter. Reuses risk.checkAlerts read-only for the credit /
 * exposure rules and adds win/pending watches. Moves no money.
 */

import { membersByRole, type Org } from '../../features/org/index.js'
import { checkAlerts, type RiskThresholds } from '../risk.js'
import type { BetRow } from '../ledger-stats.js'

const DAY = 86_400_000

export interface OperatorAlert {
  id: string
  severity: 'warn' | 'info'
  message: string
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

  // Credit-utilization + exposure-cap rules (reused from the risk lane).
  checkAlerts(org, thresholds, money, exposure).forEach((a, i) =>
    alerts.push({ id: `risk:${i}`, severity: a.severity, message: a.message }),
  )

  // Big wins in the last 24h.
  const since = now - DAY
  for (const r of rows) {
    if (r.time >= since && r.profit >= bigWin) {
      const name = org.members[r.accountId]?.name ?? r.accountId
      alerts.push({
        id: `win:${r.id}`,
        severity: 'info',
        message: `${name} won ${money(r.profit)} on ${r.game}`,
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
      })
    }
  }

  return alerts
}
