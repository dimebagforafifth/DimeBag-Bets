/**
 * Invoice export — PURE serializers for a billing_period. No DOM, no money; the panel wires
 * the returned strings to a file download.
 */

import { usd } from './format.js'
import type { BillingPeriod } from './types.js'

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** A per-head CSV of the invoice: the money summary header rows, then one row per head. */
export function invoiceCsv(period: BillingPeriod): string {
  const summary: string[][] = [
    ['invoice', period.id],
    ['tenant', period.tenantId],
    ['week_start', new Date(period.weekStart).toISOString()],
    ['week_end', new Date(period.weekEnd).toISOString()],
    ['status', period.status],
    ['active_head_count', String(period.activeHeadCount)],
    ['billed_head_count', String(period.billedHeadCount)],
    ['base', usd(period.baseCents)],
    ['add_ons', usd(period.addonCents)],
    ['discount', usd(period.discountCents)],
    ['total', usd(period.totalCents)],
    [],
    ['player_id', 'player_name', 'agent_id', 'agent_name', 'active', 'reason'],
  ]
  const heads = period.snapshots.map((s) => [
    s.playerId,
    s.playerName,
    s.agentId ?? '',
    s.agentName ?? '',
    String(s.active),
    s.reason,
  ])
  return [...summary, ...heads].map((row) => row.map(csvCell).join(',')).join('\n')
}

/** The full invoice as pretty JSON. */
export function invoiceJson(period: BillingPeriod): string {
  return JSON.stringify(period, null, 2)
}
