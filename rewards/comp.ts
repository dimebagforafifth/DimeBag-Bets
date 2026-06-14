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

import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import { getBook } from '../app/book-store.js'
import { downline, type Role } from '../org/index.js'
import { isTileGranted } from '../app/agent-permissions.js'
import { getRewardsConfig } from './economy.js'
import { addSpendable, recordComp, type CompKind } from './players.js'

const WEEK = 7 * 86_400_000
export const weekStart = (now: number): number => Math.floor(now / WEEK) * WEEK

/* --------------------------- the issuance ledger --------------------------- */

interface IssuanceLog {
  /** Coins issued by program key (comp / cashback / daily / mission / promo / contest). */
  byProgram: Record<string, number>
  /** Agent comp coins used, keyed `${agentId}|${weekStart}`. */
  agentComp: Record<string, number>
}

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<IssuanceLog> = persistedDoc<IssuanceLog>(store, 'rewards.issuance', {
  version: 1,
  // Seeded baseline so the economy/reporting panels render populated.
  initial: {
    byProgram: { comp: 23_000, cashback: 41_200, daily: 18_500, mission: 9_400, promo: 14_000, contest: 50_000 },
    agentComp: {},
  },
})

let log: IssuanceLog = DOC.load() ?? { byProgram: {}, agentComp: {} }
let version = 0
const listeners = new Set<() => void>()
function notify(): void {
  DOC.save(log)
  version += 1
  listeners.forEach((l) => l())
}
export function subscribeIssuance(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function getIssuanceVersion(): number {
  return version
}

/** Record coins issued by a program (optionally counting against an agent's weekly comp). */
export function recordIssuance(
  program: string,
  coins: number,
  agent?: { agentId: string; now: number },
): void {
  if (coins <= 0) return
  const byProgram = { ...log.byProgram, [program]: (log.byProgram[program] ?? 0) + coins }
  const agentComp = { ...log.agentComp }
  if (agent) {
    const key = `${agent.agentId}|${weekStart(agent.now)}`
    agentComp[key] = (agentComp[key] ?? 0) + coins
  }
  log = { byProgram, agentComp }
  notify()
}

export function totalIssued(): number {
  return Object.values(log.byProgram).reduce((a, b) => a + b, 0)
}
export function issuedByProgram(): Record<string, number> {
  return log.byProgram
}
export function agentCompUsed(agentId: string, now: number): number {
  return log.agentComp[`${agentId}|${weekStart(now)}`] ?? 0
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

  const cfg = getRewardsConfig()
  const coins = req.kind === 'coins' || req.kind === 'freeplay' ? Math.max(0, Math.round(req.amount)) : 0

  if (cfg.economy.totalIssuanceCap > 0 && totalIssued() + coins > cfg.economy.totalIssuanceCap) {
    return { ok: false, error: 'The program’s total issuance cap has been reached.' }
  }
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
  recordIssuance(
    'comp',
    coins,
    req.actorRole !== 'manager' ? { agentId: req.actorMemberId, now: req.now } : undefined,
  )
  return { ok: true }
}

export function __resetIssuance(): void {
  log = { byProgram: {}, agentComp: {} }
  notify()
}
