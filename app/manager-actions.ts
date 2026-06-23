/**
 * Manager actions that compose the book with the durable ledger — operator levers that
 * move money or change the book AND must leave an audit trail. Each runs its mutation
 * through book-store's `mutateBook` (so it persists + re-renders) and records an
 * audited entry in the durable book ledger (app/book-ledger), tagged with the actor and
 * a reason. Money still moves only through core (§3). This lives at the app layer so
 * org/ stays store-agnostic; App wires these to the Management console as props.
 */

import { adjustBalance } from '../core/index.js'
import { getMember, type Org } from '../features/org/index.js'
import type { LedgerEntry } from '../ledger/index.js'
import { formatMoney } from '../games/shared/money.js'
import { getBook, mutateBook } from './book-store.js'
import { recordBookEntry } from './book-ledger.js'
import { recordAudit, type AuditDraft } from './audit-store.js'

/* ----------------------- audited book mutation (Step 6) ------------------ */

/** The member fields the audit log watches for manual changes. */
interface Snap {
  name: string
  role: string
  creditLimit: number
  active: boolean
  bettingLocked: boolean
  maxWager: number | null
  parentId: string | null
}

function snapshot(org: Org): Record<string, Snap> {
  const out: Record<string, Snap> = {}
  for (const m of Object.values(org.members)) {
    out[m.id] = {
      name: m.name,
      role: m.role,
      creditLimit: m.account.creditLimit,
      active: m.active,
      bettingLocked: !!m.account.bettingLocked,
      maxWager: m.account.maxWager ?? null,
      parentId: m.parentId,
    }
  }
  return out
}

const cap = (n: number | null) => (n == null ? '∞' : formatMoney(n))

/** Diff two org snapshots into per-change audit drafts (old→new), most-specific first. */
function diff(before: Record<string, Snap>, after: Record<string, Snap>, actor: string): AuditDraft[] {
  const drafts: AuditDraft[] = []
  for (const [id, b] of Object.entries(before)) {
    const a = after[id]
    if (!a) {
      drafts.push({ actor, action: 'remove', memberId: id, memberName: b.name, detail: `Removed ${b.role} “${b.name}”` })
      continue
    }
    if (a.name !== b.name) drafts.push({ actor, action: 'rename', memberId: id, memberName: a.name, detail: `Renamed “${b.name}” → “${a.name}”` })
    if (a.creditLimit !== b.creditLimit) drafts.push({ actor, action: 'credit', memberId: id, memberName: a.name, detail: `Credit limit ${formatMoney(b.creditLimit)} → ${formatMoney(a.creditLimit)}` })
    if (a.active !== b.active) drafts.push({ actor, action: 'active', memberId: id, memberName: a.name, detail: a.active ? 'Reactivated' : 'Suspended' })
    if (a.bettingLocked !== b.bettingLocked) drafts.push({ actor, action: 'lock', memberId: id, memberName: a.name, detail: a.bettingLocked ? 'Locked betting' : 'Unlocked betting' })
    if (a.maxWager !== b.maxWager) drafts.push({ actor, action: 'maxbet', memberId: id, memberName: a.name, detail: `Max bet ${cap(b.maxWager)} → ${cap(a.maxWager)}` })
    if (a.parentId !== b.parentId) {
      const from = before[b.parentId ?? '']?.name ?? b.parentId ?? '—'
      const to = after[a.parentId ?? '']?.name ?? a.parentId ?? '—'
      drafts.push({ actor, action: 'move', memberId: id, memberName: a.name, detail: `Moved ${from} → ${to}` })
    }
  }
  for (const [id, a] of Object.entries(after)) {
    if (!before[id]) drafts.push({ actor, action: 'add', memberId: id, memberName: a.name, detail: `Added ${a.role} “${a.name}”` })
  }
  return drafts
}

/** Collapse a bulk change (one mutation touching many members the SAME way, e.g. a
 *  book-wide freeze) into a single summary entry, so the log stays readable. Grouped
 *  by action AND exact detail, so only same-direction changes collapse (a mixed bulk
 *  stays itemised) and the summary text is unambiguous. */
function collapse(drafts: AuditDraft[]): AuditDraft[] {
  const groups = new Map<string, AuditDraft[]>()
  for (const d of drafts) {
    const key = `${d.action}|${d.detail}`
    const g = groups.get(key)
    if (g) g.push(d)
    else groups.set(key, [d])
  }
  const out: AuditDraft[] = []
  for (const items of groups.values()) {
    if (items.length > 3) {
      out.push({ actor: items[0].actor, action: 'bulk', memberId: '', memberName: `${items.length} members`, detail: `${items[0].detail} — ${items.length} members` })
    } else {
      out.push(...items)
    }
  }
  return out
}

/**
 * Run a book mutation through `mutateBook` AND audit it: snapshot the auditable fields
 * before, apply, then diff and log each change (old→new) with the actor. A failed
 * mutation throws before the after-snapshot, so nothing is audited. This is the audited
 * `onMutate` the Management console runs every change through (Step 6).
 */
export function auditedMutate(fn: (org: Org) => void, actor = 'operator'): void {
  const before = snapshot(getBook())
  mutateBook(fn) // throws propagate; on a throw nothing below runs → no audit
  const after = snapshot(getBook())
  for (const draft of collapse(diff(before, after, actor))) recordAudit(draft)
}

/**
 * Manually adjust a member's figure by `delta` (a re-credit, comp, or correction) and
 * record it in the durable ledger with the actor + reason for the audit trail. A reason
 * is required and the delta must be a non-zero whole number. Returns the recorded entry.
 * Throws (changing nothing) if the member is unknown or the input is invalid.
 */
export function adjustFigure(
  memberId: string,
  delta: number,
  reason: string,
  actor = 'operator',
): LedgerEntry {
  const why = reason.trim()
  if (!why) throw new Error('an adjustment needs a reason (for the audit trail)')
  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error('adjustment must be a non-zero whole number of points')
  }
  const member = getMember(getBook(), memberId) // validate the member exists before mutating
  mutateBook((org) => adjustBalance(getMember(org, memberId).account, delta))
  const acct = getBook().members[memberId].account
  const entry = recordBookEntry({
    kind: 'adjust',
    accountId: memberId,
    balanceDelta: delta,
    pendingDelta: 0,
    balanceAfter: acct.balance,
    pendingAfter: acct.pending,
    actor,
    reason: why,
  })
  // also surface it in the operator audit trail (who moved the figure + why)
  recordAudit({
    actor,
    action: 'adjust',
    memberId,
    memberName: member.name,
    detail: `${delta > 0 ? '+' : ''}${formatMoney(delta)} — ${why}`,
  })
  return entry
}
