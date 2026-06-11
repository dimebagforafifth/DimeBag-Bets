/**
 * Operations on the organisation hierarchy (CLAUDE.md §3, §4).
 *
 * These build and read the Manager → Sub-Agent → Agent → Player pyramid and
 * enforce its one rule: a member's parent must be of a strictly higher tier
 * (see ROLE_TIER). They mutate the passed `Org` in place (matching the style of
 * `core`), so a UI can hold one Org and re-render on change. Every member's
 * money lives in a `core` Account; nothing here tracks points itself.
 */

import type { Account } from '../core/index.js'
import { settleWeek } from '../core/index.js'
import type { Member, MemberProfile, Org, Role } from './types.js'

/**
 * Tier rank — lower sits higher in the tree. The single placement rule is
 * `ROLE_TIER[parent] < ROLE_TIER[child]`, which is what keeps sub-agents under
 * the manager, agents under sub-agents/the manager, and players under anything
 * but another player. (Because every parent is a strictly higher tier, a
 * member's whole downline is strictly lower tier — so cycles are impossible.)
 */
export const ROLE_TIER: Record<Role, number> = {
  manager: 0,
  subagent: 1,
  agent: 2,
  player: 3,
}

let seq = 0

/** Mint a unique member id when the caller doesn't supply one. */
function nextId(prefix: string): string {
  seq += 1
  return `${prefix}_${seq}`
}

/** A fresh figure: zero balance, nothing pending, and whatever credit was granted
 *  (none until the level above sets a limit). */
function makeAccount(id: string, creditLimit: number): Account {
  assertCredit(creditLimit)
  return { id, creditLimit, balance: 0, pending: 0 }
}

function assertCredit(creditLimit: number): void {
  if (!Number.isInteger(creditLimit) || creditLimit < 0) {
    throw new Error(`creditLimit must be a whole number ≥ 0, got ${creditLimit}`)
  }
}

const ROLE_LABEL: Record<Role, string> = {
  manager: 'manager',
  subagent: 'sub-agent',
  agent: 'agent',
  player: 'player',
}

/** "an agent" / "a sub-agent" — keep the error messages readable. */
function withArticle(role: Role): string {
  const label = ROLE_LABEL[role]
  return /^[aeiou]/.test(label) ? `an ${label}` : `a ${label}`
}

export interface NewMember {
  name: string
  /** Credit granted to this member by the level above. Defaults to 0. */
  creditLimit?: number
  /** Supply a fixed id (handy for tests / seeding); otherwise one is minted. */
  id?: string
  /** Optional contact/identity details; defaults to an empty profile. */
  profile?: MemberProfile
}

/* ------------------------------- building ------------------------------- */

/**
 * Start a new organisation, rooted at a manager — the customer we sell to.
 */
export function createOrg(manager: NewMember): Org {
  const id = manager.id ?? nextId('mgr')
  const root: Member = {
    id,
    role: 'manager',
    name: manager.name,
    parentId: null,
    account: makeAccount(id, manager.creditLimit ?? 0),
    active: true,
    profile: manager.profile ?? {},
  }
  return { managerId: id, members: { [id]: root } }
}

/** Look up a member, throwing if the id is unknown. */
export function getMember(org: Org, id: string): Member {
  const m = org.members[id]
  if (!m) throw new Error(`no member with id ${id}`)
  return m
}

/**
 * Add a member of `role` under `parentId`. The single rule: the parent must be a
 * strictly higher tier than the new member (ROLE_TIER). This is the generic
 * builder; `addSubAgent` / `addAgent` / `addPlayer` are thin wrappers over it.
 */
export function addMember(org: Org, role: Role, parentId: string, opts: NewMember): Member {
  if (role === 'manager') {
    throw new Error('an org has exactly one manager — set it with createOrg')
  }
  const parent = getMember(org, parentId)
  if (!parent.active) {
    throw new Error(`parent ${parentId} is inactive — can't recruit under it`)
  }
  if (ROLE_TIER[parent.role] >= ROLE_TIER[role]) {
    throw new Error(`${withArticle(role)} can't sit under ${withArticle(parent.role)}`)
  }
  // Credit waterfall: a member can't be granted more than the parent has left to
  // hand down (the parent's own limit minus what it's already allocated).
  const granted = opts.creditLimit ?? 0
  if (granted > availableCredit(org, parentId)) {
    throw new Error(`that credit exceeds ${parent.name}'s available credit to grant`)
  }
  const id = opts.id ?? nextId(role.slice(0, 3))
  const member: Member = {
    id,
    role,
    name: opts.name,
    parentId,
    account: makeAccount(id, opts.creditLimit ?? 0),
    active: true,
    profile: opts.profile ?? {},
  }
  org.members[id] = member
  return member
}

/** Recruit a sub-agent — always a direct child of the manager. */
export function addSubAgent(org: Org, opts: NewMember): Member {
  return addMember(org, 'subagent', org.managerId, opts)
}

/** Recruit an agent under a sub-agent (or directly under the manager). */
export function addAgent(org: Org, parentId: string, opts: NewMember): Member {
  return addMember(org, 'agent', parentId, opts)
}

/** Add a player under an agent, a sub-agent, or the manager. */
export function addPlayer(org: Org, parentId: string, opts: NewMember): Member {
  return addMember(org, 'player', parentId, opts)
}

/** Members of a given role that a new `role` member could be placed under — i.e.
 *  every active member of a strictly higher tier. Drives the parent picker. */
export function eligibleParents(org: Org, role: Role): Member[] {
  return Object.values(org.members).filter(
    (m) => m.active && ROLE_TIER[m.role] < ROLE_TIER[role],
  )
}

/* -------------------------------- reading ------------------------------- */

/** The members directly under `id` (one level down). */
export function directReports(org: Org, id: string): Member[] {
  return Object.values(org.members).filter((m) => m.parentId === id)
}

/** The players directly under a member. */
export function directPlayers(org: Org, id: string): Member[] {
  return directReports(org, id).filter((m) => m.role === 'player')
}

/** Every member of a given role anywhere in the org. */
export function membersByRole(org: Org, role: Role): Member[] {
  return Object.values(org.members).filter((m) => m.role === role)
}

/** Everyone beneath `id` — their whole downline, any depth. */
export function downline(org: Org, id: string): Member[] {
  const out: Member[] = []
  const stack = directReports(org, id)
  while (stack.length > 0) {
    const m = stack.pop() as Member
    out.push(m)
    stack.push(...directReports(org, m.id))
  }
  return out
}

/** How many players sit anywhere beneath `id`. */
export function playerCount(org: Org, id: string): number {
  return downline(org, id).filter((m) => m.role === 'player').length
}

/**
 * The figure a member is carrying: their own balance plus every balance beneath
 * them. This is the managerial view — what a sub-agent's or agent's whole book
 * (or the manager's whole operation) is up or down right now. Positive = the
 * book owes the players; negative = the players owe the book.
 */
export function bookFigure(org: Org, id: string): number {
  const self = getMember(org, id)
  return downline(org, id).reduce((sum, m) => sum + m.account.balance, self.account.balance)
}

/** Credit a member has already granted to their DIRECT children. */
export function allocatedCredit(org: Org, id: string): number {
  return directReports(org, id).reduce((sum, c) => sum + c.account.creditLimit, 0)
}

/** Credit a member can still hand down: their own limit minus what's allocated.
 *  The top of the waterfall — the manager — is limited only by their own line. */
export function availableCredit(org: Org, id: string): number {
  return getMember(org, id).account.creditLimit - allocatedCredit(org, id)
}

/**
 * How much of a member's OWN credit line is consumed right now, as a fraction
 * 0..1 — the operator's risk gauge. A player deep in the red (plus anything
 * pending) sits near 1, the signal they're close to their limit and a collection
 * risk; 0 when they're even or up, or have no line. Used credit = the losses
 * (negative balance) plus live at-risk pending, capped at the limit.
 */
export function creditUtilization(member: Member): number {
  const { creditLimit, balance, pending } = member.account
  if (creditLimit <= 0) return 0
  const used = Math.max(0, pending - balance)
  return Math.min(1, used / creditLimit)
}

/* ------------------------------- mutating ------------------------------- */

/**
 * Grant (or change) a member's credit limit — the lever the level above pulls.
 * Holds the waterfall in both directions: a member can't be granted more than
 * their parent has left to hand down, and can't be cut below what they've
 * already granted to their own downline.
 */
export function setCreditLimit(org: Org, id: string, creditLimit: number): void {
  assertCredit(creditLimit)
  const member = getMember(org, id)

  const allocated = allocatedCredit(org, id)
  if (creditLimit < allocated) {
    throw new Error(`${member.name} has already granted ${allocated} downstream — can't go below that`)
  }
  if (member.parentId) {
    const parent = getMember(org, member.parentId)
    // headroom = parent's limit minus what's allocated to the OTHER siblings
    const headroom = parent.account.creditLimit - (allocatedCredit(org, parent.id) - member.account.creditLimit)
    if (creditLimit > headroom) {
      throw new Error(`that credit exceeds ${parent.name}'s available credit to grant`)
    }
  }
  member.account.creditLimit = creditLimit
}

/** Activate / deactivate a member without removing their figure or downline. */
export function setActive(org: Org, id: string, active: boolean): void {
  getMember(org, id).active = active
}

/**
 * Move a member (with their whole downline) under a new parent. The manager is
 * the fixed root and can't be moved; otherwise the same tier rule applies — the
 * new parent must be a strictly higher tier, which also makes it impossible to
 * move a member under its own downline.
 */
export function reassign(org: Org, memberId: string, newParentId: string): void {
  const member = getMember(org, memberId)
  if (member.role === 'manager') {
    throw new Error('the manager is the root and cannot be moved')
  }
  const parent = getMember(org, newParentId)
  if (ROLE_TIER[parent.role] >= ROLE_TIER[member.role]) {
    throw new Error(`${withArticle(member.role)} can't sit under ${withArticle(parent.role)}`)
  }
  // The member brings their credit line with them — it has to fit under the new
  // parent's remaining headroom.
  if (member.account.creditLimit > availableCredit(org, newParentId)) {
    throw new Error(`${parent.name} doesn't have the credit headroom for ${member.name}`)
  }
  member.parentId = newParentId
}

/**
 * Set (or clear) a player's per-head max bet — the operator's cap on a single
 * wager, enforced in core's `placeWager` so every game and the sportsbook honour
 * it. Pass `null` to remove the cap. Only players wager, so it's a player lever.
 */
export function setMaxWager(org: Org, id: string, maxWager: number | null): void {
  const member = getMember(org, id)
  if (member.role !== 'player') {
    throw new Error("only players have a max bet — sub-agents and agents don't wager")
  }
  if (maxWager == null) {
    delete member.account.maxWager
    return
  }
  if (!Number.isInteger(maxWager) || maxWager < 1) {
    throw new Error(`max bet must be a whole number ≥ 1 (or null to clear), got ${maxWager}`)
  }
  member.account.maxWager = maxWager
}

/**
 * Set (or clear) a player's per-head MIN bet — the smallest single wager allowed,
 * enforced in core's `placeWager`. Pass `null` to remove the floor. Players only.
 */
export function setMinWager(org: Org, id: string, minWager: number | null): void {
  const member = getMember(org, id)
  if (member.role !== 'player') {
    throw new Error("only players have a min bet — sub-agents and agents don't wager")
  }
  if (minWager == null) {
    delete member.account.minWager
    return
  }
  if (!Number.isInteger(minWager) || minWager < 1) {
    throw new Error(`min bet must be a whole number ≥ 1 (or null to clear), got ${minWager}`)
  }
  member.account.minWager = minWager
}

/**
 * Set (or clear) a player's per-head MAX PAYOUT — the most a single winning bet may
 * profit, enforced in core's `resolveWager` / `resolveAtMultiplier`. Pass `null` to
 * uncap. Players only.
 */
export function setMaxPayout(org: Org, id: string, maxPayout: number | null): void {
  const member = getMember(org, id)
  if (member.role !== 'player') {
    throw new Error("only players have a max payout — sub-agents and agents don't wager")
  }
  if (maxPayout == null) {
    delete member.account.maxPayout
    return
  }
  if (!Number.isInteger(maxPayout) || maxPayout < 1) {
    throw new Error(`max payout must be a whole number ≥ 1 (or null to clear), got ${maxPayout}`)
  }
  member.account.maxPayout = maxPayout
}

/**
 * Lock (or unlock) a player's betting — the operator's "no new action" switch,
 * enforced in core's `placeWager` so every game and the sportsbook stop taking
 * new bets from them. Their figure and open bets are untouched, so a locked
 * player still settles up. Only players wager, so it's a player lever.
 */
export function setBettingLocked(org: Org, id: string, locked: boolean): void {
  const member = getMember(org, id)
  if (member.role !== 'player') {
    throw new Error("only players have a betting lock — sub-agents and agents don't wager")
  }
  if (locked) member.account.bettingLocked = true
  else delete member.account.bettingLocked
}

/**
 * Freeze (or unfreeze) a whole book: lock betting on every player anywhere
 * beneath `id`. The manager's one-click "stop all action under this agent" —
 * e.g. while a line is being corrected or an agent is under review. Returns how
 * many players were changed. Non-players in the downline are skipped.
 */
export function setBookBettingLocked(org: Org, id: string, locked: boolean): number {
  let changed = 0
  for (const m of downline(org, id)) {
    if (m.role !== 'player') continue
    const was = !!m.account.bettingLocked
    if (was === locked) continue
    setBettingLocked(org, m.id, locked)
    changed += 1
  }
  return changed
}

/**
 * The book's live exposure beneath (and including) `id`: the total still at risk
 * in ungraded bets — `pending` summed over the member and their whole downline.
 * The manager's "how much is on the table right now" read for any part of the book.
 */
export function bookPending(org: Org, id: string): number {
  const self = getMember(org, id)
  return downline(org, id).reduce((sum, m) => sum + m.account.pending, self.account.pending)
}

/* ------------------------------ agent rollups --------------------------- */

/**
 * Set (or clear) an agent's / master agent's commission split — the percent (0–100) of
 * their downline's net losses they keep at weekly settlement. Players and the manager
 * carry no split. Pass null (or 0) to clear.
 */
export function setCommissionPct(org: Org, id: string, pct: number | null): void {
  const member = getMember(org, id)
  if (member.role !== 'agent' && member.role !== 'subagent') {
    throw new Error('only agents and master agents carry a commission split')
  }
  if (pct == null || pct === 0) {
    delete member.commissionPct
    return
  }
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new Error(`commission must be a percent 0–100 (or null to clear), got ${pct}`)
  }
  member.commissionPct = pct
}

/** Every PLAYER anywhere beneath `id` — an agent's or master agent's whole roster. */
export function rosterOf(org: Org, id: string): Member[] {
  return downline(org, id).filter((m) => m.role === 'player')
}

/** The agent / master agent a member ultimately reports to — the nearest ancestor of
 *  role 'agent' or 'subagent', or null if it sits directly under the manager. Drives the
 *  per-agent grouping in figures / reports. */
export function agentOf(org: Org, id: string): Member | null {
  let cur = getMember(org, id)
  while (cur.parentId) {
    const parent = org.members[cur.parentId]
    if (!parent) return null
    if (parent.role === 'agent' || parent.role === 'subagent') return parent
    cur = parent
  }
  return null
}

/** The net figure of an agent's players: the sum of their balances. Negative = the
 *  players are down on the week (the book — and so the agent — collected). */
export function agentPlayerNet(org: Org, id: string): number {
  return rosterOf(org, id).reduce((sum, p) => sum + p.account.balance, 0)
}

/**
 * The commission an agent / master agent has earned this period: `commissionPct%` of
 * their players' net LOSSES (0 when the players are net up — standard PPH: the agent
 * shares the book's win off their roster, not its loss). Pure read; nothing moves
 * until settlement nets it.
 */
export function agentCommission(org: Org, id: string): number {
  const pct = getMember(org, id).commissionPct ?? 0
  if (pct <= 0) return 0
  const playersLost = Math.max(0, -agentPlayerNet(org, id)) // the book's win off this roster
  return Math.round((playersLost * pct) / 100)
}

export interface AgentPerformance {
  agentId: string
  name: string
  role: Role
  /** Active flag of the agent themselves. */
  active: boolean
  /** Players anywhere in the subtree (roster size). */
  roster: number
  /** Agents + master agents anywhere in the subtree. */
  subAgents: number
  /** Sum of the roster's balances (negative = players down = book won off them). */
  playerNet: number
  /** Live exposure across the roster (sum of pending). */
  exposure: number
  /** Commission % carried (0 if none). */
  commissionPct: number
  /** Commission earned this period (see `agentCommission`). */
  commission: number
}

/**
 * One performance line for an agent / master agent: roster size, sub-agents, the net
 * their players are up/down, live exposure, and commission earned. One downline walk.
 * Pure read for the Agent Performance + Agent Admin views.
 */
export function agentPerformance(org: Org, id: string): AgentPerformance {
  const m = getMember(org, id)
  const sub = downline(org, id)
  const players = sub.filter((x) => x.role === 'player')
  const playerNet = players.reduce((s, p) => s + p.account.balance, 0)
  const pct = m.commissionPct ?? 0
  return {
    agentId: id,
    name: m.name,
    role: m.role,
    active: m.active,
    roster: players.length,
    subAgents: sub.filter((x) => x.role === 'agent' || x.role === 'subagent').length,
    playerNet,
    exposure: players.reduce((s, p) => s + p.account.pending, 0),
    commissionPct: pct,
    commission: pct > 0 ? Math.round((Math.max(0, -playerNet) * pct) / 100) : 0,
  }
}

/** Every agent + master agent in the book, manager-first by tier then name — the source
 *  list for the Agent Admin and Agent Performance panels (and agent scope selectors). */
export function allAgents(org: Org): Member[] {
  return Object.values(org.members)
    .filter((m) => m.role === 'agent' || m.role === 'subagent')
    .sort((a, b) => ROLE_TIER[a.role] - ROLE_TIER[b.role] || a.name.localeCompare(b.name))
}

/** Merge a patch into a member's profile (contact/identity/notes). Only the given
 *  fields change; pass an empty string to clear one. No tree/money rules involved. */
export function setMemberProfile(org: Org, id: string, patch: Partial<MemberProfile>): void {
  const member = getMember(org, id)
  member.profile = { ...member.profile, ...patch }
}

/** Rename a member. Purely a label — no tree rules involved. */
export function renameMember(org: Org, id: string, name: string): void {
  const member = getMember(org, id)
  const trimmed = name.trim()
  if (!trimmed) throw new Error('name cannot be empty')
  member.name = trimmed
}

/**
 * Remove a member from the book. The guards keep the tree and the money model
 * sound: the manager is the root and can't be removed; a member with a downline
 * must have it moved or removed first; and a member still carrying a figure (a
 * balance owed either way, or a live pending bet) must be settled first — you
 * don't erase a debt by deleting the account.
 */
export function removeMember(org: Org, id: string): void {
  const member = getMember(org, id)
  if (member.role === 'manager') {
    throw new Error('the manager is the root and cannot be removed')
  }
  const reports = directReports(org, id)
  if (reports.length > 0) {
    const n = reports.length
    throw new Error(`${member.name} still has ${n} member${n === 1 ? '' : 's'} under them — move or remove those first`)
  }
  if (member.account.pending !== 0) {
    throw new Error(`${member.name} has a live bet pending — wait for it to settle`)
  }
  if (member.account.balance !== 0) {
    const dir = member.account.balance > 0 ? 'positive' : 'negative'
    throw new Error(`${member.name} carries a ${dir} figure — settle it before removing`)
  }
  delete org.members[id]
}

/* ----------------------------- settlement ------------------------------- */

/** One line of a weekly settlement: what a member squares up to the level above
 *  (their whole book figure). For the manager it's the whole operation's net. */
export interface Settlement {
  memberId: string
  name: string
  role: Role
  parentId: string | null
  /** Positive = the level above owes this member; negative = this member owes up. */
  amount: number
}

/**
 * A preview of weekly settlement WITHOUT applying it: each member's book figure,
 * which is exactly what they'd square with the level above (a player settles
 * their own figure with their agent; the agent — now holding what it collected —
 * settles up to its sub-agent; and so on to the manager). Pure read.
 */
export function settlementStatement(org: Org): Settlement[] {
  return Object.values(org.members).map((m) => ({
    memberId: m.id,
    name: m.name,
    role: m.role,
    parentId: m.parentId,
    amount: bookFigure(org, m.id),
  }))
}

/**
 * Run weekly settlement: roll every figure up the tree (bottom-up, each member's
 * balance flows into their parent), leaving the manager holding the whole book,
 * then square the manager to zero for the new week via core's `settleWeek`. All
 * other balances end at zero. Returns the statement (computed before the reset)
 * so the operator has the record. Requires no wagers still pending anywhere.
 *
 * With `{ carryover: true }` it records the same statement but does NOT roll up or
 * zero anything — every figure carries forward into the next period (a soft close /
 * snapshot, for when the book isn't actually collected this period). The pending
 * guard still applies so the snapshot is clean.
 */
export function settleOrgWeek(org: Org, opts: { carryover?: boolean } = {}): Settlement[] {
  const stuck = Object.values(org.members).find((m) => m.account.pending !== 0)
  if (stuck) {
    throw new Error(`can't settle: ${stuck.name} still has ${stuck.account.pending} pending`)
  }
  const statement = settlementStatement(org)
  if (opts.carryover) return statement // record the standings; figures carry forward

  // Roll balances up, deepest tier first, so each parent accumulates everything
  // beneath it before it settles upward in turn.
  const bottomUp = Object.values(org.members).sort((a, b) => ROLE_TIER[b.role] - ROLE_TIER[a.role])
  for (const m of bottomUp) {
    if (m.parentId == null) continue // the manager is squared below
    org.members[m.parentId].account.balance += m.account.balance
    m.account.balance = 0
  }
  // The manager now carries the whole book; settle it to zero for the new week.
  settleWeek(getMember(org, org.managerId).account)

  return statement
}
