/**
 * The organisation hierarchy (the player-management system).
 *
 * Modelled on the standard sportsbook / Pay-Per-Head pyramid that operators sell:
 *
 *     Manager              ← the customer we sell the software to (the root)
 *       ├── Sub-Agent      ← a tier directly under the manager, above agents
 *       │     ├── Agent    ← recruited under a sub-agent; recruits players
 *       │     │     └── Player
 *       │     └── Player
 *       ├── Agent          ← an agent can also sit directly under the manager
 *       └── Player         ← a player can sit at any level above it
 *
 * Roles form a strict tier order — manager > sub-agent > agent > player — and the
 * one rule is: **a member's parent must be of a strictly higher tier.** That
 * yields exactly:
 *   - a **manager** is the root and has no parent,
 *   - a **sub-agent** sits directly under the manager,
 *   - an **agent** sits under a sub-agent or the manager,
 *   - a **player** sits under an agent, a sub-agent, or the manager — never under
 *     another player.
 *
 * Every member carries their own credit/balance figure via the shared `core`
 * money model (CLAUDE.md §3) — no separate points are tracked here. The org just
 * arranges those accounts into the bookie hierarchy and enforces the rules.
 */

import type { Account } from '../../core/index.js'
import type { CommissionConfig } from './commission.js'

export type Role = 'manager' | 'subagent' | 'agent' | 'player'

/** Optional contact/identity details for a member (mostly used for players). All
 *  fields are optional; the object itself is always present (default {}) so callers
 *  can read `member.profile.nickname` without null-checks. Money is never here — it
 *  lives in `account` (the core model). */
export interface MemberProfile {
  nickname?: string
  email?: string
  phone?: string
  /** Free-text operator notes (VIP flags, collection notes, etc.). */
  notes?: string
}

export interface Member {
  id: string
  role: Role
  name: string
  /** null only for the manager (the root); agents and players always have one. */
  parentId: string | null
  /** This member's own credit/balance figure — the shared core money model. */
  account: Account
  /** Inactive members keep their figure and place in the tree but take no new
   *  action (can't be wagered under / recruited under). */
  active: boolean
  /** Contact/identity details. Always present (default {}); see MemberProfile. */
  profile: MemberProfile
  /**
   * Commission split for an AGENT or MASTER AGENT only — the percent (0–100) of their
   * downline's net LOSSES they keep when the book squares up weekly. The manager owes
   * the agent `commissionPct%` of what the agent's players lost; it nets against what
   * the agent owes up. Undefined / 0 for players and the manager. See `agentCommission`.
   *
   * LEGACY: the original single-knob commission. When `commission` (below) is set it WINS;
   * otherwise a bare `commissionPct` is read as the equivalent PROFIT-SHARE config, so old
   * books keep settling exactly as before.
   */
  commissionPct?: number
  /**
   * The agent's commission MODEL — split / profit-share / redline — plus its rate and
   * (for redline) the running make-up carryover. AGENT / MASTER AGENT only. When present it
   * supersedes `commissionPct`. See `org/commission.ts` and `agentDistribution`.
   */
  commission?: CommissionConfig
}

/**
 * One organisation, rooted at a single manager — i.e. one customer's whole book.
 * Members are keyed by id for O(1) lookup; the tree is reconstructed from each
 * member's `parentId`.
 */
export interface Org {
  /** The root manager's id. */
  managerId: string
  members: Record<string, Member>
}
