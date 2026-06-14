/**
 * The COMP engine + the coin-economy issuance ledger (CLAUDE.md §4) — the one path that
 * hands discretionary rewards to a player, gated by the SAME role/permission model as the
 * rest of the console (no separate access system):
 *
 *   - MANAGER: may comp any player, bounded only by the economy's total issuance cap.
 *   - AGENT / SUB-AGENT: may comp ONLY their own downline, ONLY if the manager granted the
 *     'rewards-comp' permission, and ONLY within the manager-set weekly comp allowance.
 *   - PLAYER: may never comp.
 *
 * COINS / STATUS ONLY. A comp is bonus coins (→ the spendable rewards balance), free plays,
 * a temporary limit boost, or a badge — never cash, never withdrawable. Every comp is
 * recorded against the player and counted in the issuance ledger so the economy can't be
 * blown up and the manager can report on it.
 */

import { getBook } from '../app/book-store.js'
import { downline, type Role } from '../org/index.js'
import { isTileGranted } from '../app/agent-permissions.js'
import {
  getRewardsConfig,
  canIssue,
  recordIssuance,
  agentCompUsed,
  totalIssued,
  issuedByProgram,
  subscribeIssuance,
  getIssuanceVersion,
  weekStart,
  __resetIssuance,
} from './economy.js'
import { addSpendable, recordComp, type CompKind } from './players.js'

// The issuance ledger lives in economy (its home); re-exported so the admin panels can
// keep importing it from here.
export {
  recordIssuance,
  totalIssued,
  issuedByProgram,
  agentCompUsed,
  subscribeIssuance,
  getIssuanceVersion,
  weekStart,
  __resetIssuance,
}

/* --------------------------------- comp ----------------------------------- */

export interface CompRequest {
  actorMemberId: string
  actorRole: Role
  targetPlayerId: string
  kind: CompKind
  /** Coins (for 'coins' / 'freeplay'); ignored for 'limitboost' / 'badge'. */
  amount: number
  reason: string
  now: number
}
export interface CompResult {
  ok: boolean
  error?: string
}

/** Whether `actor` may comp `target` at all (role + permission + downline scope). */
export function canComp(
  actorMemberId: string,
  actorRole: Role,
  targetPlayerId: string,
): { ok: boolean; reason?: string } {
  if (actorRole === 'manager') return { ok: true }
  if (actorRole === 'agent' || actorRole === 'subagent') {
    if (!isTileGranted(actorMemberId, 'rewards-comp')) {
      return { ok: false, reason: 'The manager hasn’t granted you comp rights.' }
    }
    const inDownline = downline(getBook(), actorMemberId).some((m) => m.id === targetPlayerId)
    if (!inDownline) return { ok: false, reason: 'That player isn’t in your downline.' }
    return { ok: true }
  }
  return { ok: false, reason: 'Players can’t issue comps.' }
}

/** The remaining weekly comp allowance for an agent (Infinity for a manager). */
export function compAllowanceLeft(actorMemberId: string, actorRole: Role, now: number): number {
  if (actorRole === 'manager') return Infinity
  const cap = getRewardsConfig().economy.agentWeeklyCompAllowance
  return Math.max(0, cap - agentCompUsed(actorMemberId, now))
}

/**
 * Issue a comp. Enforces the role gate, the agent's weekly allowance, and the economy's
 * total issuance cap, then records it against the player + the issuance ledger. Coins/free-
 * play comps credit the player's spendable rewards balance; limit/badge comps are recorded.
 */
export function issueComp(req: CompRequest): CompResult {
  const gate = canComp(req.actorMemberId, req.actorRole, req.targetPlayerId)
  if (!gate.ok) return { ok: false, error: gate.reason }

  const coins = req.kind === 'coins' || req.kind === 'freeplay' ? Math.max(0, Math.round(req.amount)) : 0

  // Economy guard: the program-wide total cap + the weekly budget.
  const cap = canIssue(coins, req.now)
  if (!cap.ok) return { ok: false, error: cap.reason }
  // Agent-specific guard: their weekly comp allowance.
  if (req.actorRole !== 'manager' && coins > 0) {
    const left = compAllowanceLeft(req.actorMemberId, req.actorRole, req.now)
    if (coins > left) {
      return { ok: false, error: `Over your weekly comp allowance — ${left.toLocaleString()} coins left.` }
    }
  }

  const byName = getBook().members[req.actorMemberId]?.name ?? req.actorMemberId
  recordComp(
    req.targetPlayerId,
    { by: req.actorMemberId, byName, kind: req.kind, amount: coins, reason: req.reason.trim() || '—' },
    req.now,
  )
  if (coins > 0) addSpendable(req.targetPlayerId, coins) // bonus coins / free plays → spendable
  recordIssuance('comp', coins, req.now, req.actorRole !== 'manager' ? { agentId: req.actorMemberId } : undefined)
  return { ok: true }
}
