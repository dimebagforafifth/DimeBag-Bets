/**
 * The bonus ENGINE — the stateful runtime that applies operator-authored rules (rules.ts)
 * to the live book, with every credit movement going through core (CLAUDE.md §3).
 *
 * Money path (the ONLY money path — never poke a balance directly):
 *   - GRANT:     `core.grant` (the house gives) inside `mutateBook`, so the figure moves
 *                through the one sanctioned primitive, the book persists, and a GrantEvent
 *                fires for analytics/ledger. The grant is recorded as a "bonus credits"
 *                ticket carrying a playthrough requirement.
 *   - CLEAR:     when the player has wagered enough, the ticket flips from "bonus credits"
 *                to "cleared" — a STATE change only. The credits already live in the one
 *                core balance (granted up front); clearing just lifts the lock. No money
 *                moves, which is exactly what "bonus credits vs cleared balance is a state
 *                distinction, not a second money path" means.
 *   - EXPIRE:    an uncleared grant past its expiry is clawed back via `adjustFigure` (a
 *                NEGATIVE core adjustment, audited in the durable ledger). The player
 *                forfeits the bonus they never cleared.
 *
 * Triggers fire explicitly (`fireTrigger`) — from the console demo controls, the wiring
 * pass's hooks, or tests. Turnover is fed from real wagers once `armBonusEngine()` is
 * called (the wiring pass + the panel arm it). Rules are operator-editable DATA, persisted.
 */

import { grant } from '../core/index.js'
import { onWagerPlaced } from '../core/index.js'
import { getMember, downline, membersByRole, type Member, type Org } from '../org/index.js'
import { getBook, mutateBook } from '../app/book-store.js'
import { adjustFigure } from '../app/manager-actions.js'
import { getPlayerRewards, grantFreeSpins } from '../rewards/players.js'
import { getRewardsConfig, recordIssuance, canIssue } from '../rewards/economy.js'
import { tierForStatus } from '../rewards/data.js'
import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import {
  isEligible,
  playerSegment,
  rewardGrantCents,
  requiredTurnoverCents,
  type BonusRule,
  type BonusTrigger,
  type EligibilityContext,
  type RewardContext,
} from './rules.js'

/* --------------------------------- the grant ticket ------------------------ */

export type GrantStatus = 'active' | 'cleared' | 'expired'

/** One bonus handed to one player — the live record of a grant + its playthrough. The credit
 *  itself lives in the player's core balance; this tracks the bonus STATE around it. */
export interface BonusGrant {
  id: string
  ruleId: string
  ruleName: string
  trigger: BonusTrigger
  playerId: string
  playerName: string
  /** Bonus credit granted via core.grant (cents). 0 for a free-spins reward. */
  grantedCents: number
  /** Turnover required to clear (cents) = grantedCents × playthroughX. */
  requiredTurnoverCents: number
  /** Turnover accrued from real wagers since the grant (cents). */
  turnoverCents: number
  /** The max-win cap that was applied (cents) — for display. */
  maxWinCents: number | null
  status: GrantStatus
  grantedAt: number
  expiresAt: number
  clearedAt?: number
  expiredAt?: number
  /** Free spins granted (free-spins reward only). */
  spins?: number
}

/* --------------------------------- the rule store -------------------------- */

const DAY = 86_400_000

/** Seed rules across trigger types so the engine reads as real out of the box. */
export const DEFAULT_RULES: BonusRule[] = [
  {
    id: 'welcome-credit',
    name: 'Welcome Bonus',
    enabled: true,
    trigger: 'signup',
    reward: { kind: 'credit', valueCents: 500_00 },
    eligibility: { segments: ['new'] },
    playthroughX: 3,
    expiryMs: 14 * DAY,
    maxWinCents: 2_000_00,
    oncePerPlayer: true,
  },
  {
    id: 'reload-match',
    name: 'Reload Match 50%',
    enabled: true,
    trigger: 'deposit',
    reward: { kind: 'match', pct: 50 },
    eligibility: {},
    playthroughX: 5,
    expiryMs: 7 * DAY,
    maxWinCents: 5_000_00, // "up to $5,000"
  },
  {
    id: 'first-bet-boost',
    name: 'First-Bet Free Play',
    enabled: true,
    trigger: 'first-bet',
    reward: { kind: 'credit', valueCents: 250_00 },
    eligibility: {},
    playthroughX: 1,
    expiryMs: 7 * DAY,
    maxWinCents: 1_000_00,
    oncePerPlayer: true,
  },
  {
    id: 'comeback-rakeback',
    name: 'Comeback Rakeback 10%',
    enabled: true,
    trigger: 'losing-streak',
    reward: { kind: 'rakeback', pct: 10 },
    eligibility: { segments: ['at-risk'] },
    playthroughX: 2,
    expiryMs: 5 * DAY,
    maxWinCents: 2_500_00,
  },
  {
    id: 'daily-spins',
    name: 'Daily Free Spins',
    enabled: true,
    trigger: 'daily',
    reward: { kind: 'free-spins', spins: 3 },
    eligibility: {},
    playthroughX: 0,
    expiryMs: 1 * DAY,
    maxWinCents: null,
  },
  {
    id: 'vip-profit-boost',
    name: 'VIP Profit Boost',
    enabled: false, // drafted, not live — shows the enable toggle
    trigger: 'manual',
    reward: { kind: 'profit-boost', pct: 25 },
    eligibility: { tiers: ['gold', 'platinum', 'diamond'] },
    playthroughX: 1,
    expiryMs: 3 * DAY,
    maxWinCents: 10_000_00,
  },
]

const store = createStore({ namespace: 'dimebag' })
const RULES_DOC: Doc<BonusRule[]> = persistedDoc<BonusRule[]>(store, 'bonus.rules', {
  version: 1,
  initial: DEFAULT_RULES,
})

let rules: BonusRule[] = RULES_DOC.load() ?? DEFAULT_RULES
let rulesVersion = 0
const ruleListeners = new Set<() => void>()
function notifyRules(): void {
  RULES_DOC.save(rules)
  rulesVersion += 1
  ruleListeners.forEach((l) => l())
}

export function subscribeBonusRules(l: () => void): () => void {
  ruleListeners.add(l)
  return () => {
    ruleListeners.delete(l)
  }
}
export function getBonusRulesVersion(): number {
  return rulesVersion
}
export function getBonusRules(): BonusRule[] {
  return rules
}

/** Create or replace a rule (operator authoring — callers gate on the manager role). */
export function upsertBonusRule(rule: BonusRule): void {
  const i = rules.findIndex((r) => r.id === rule.id)
  rules = i >= 0 ? rules.map((r) => (r.id === rule.id ? rule : r)) : [...rules, rule]
  notifyRules()
}
/** Turn a rule on/off without re-authoring it. */
export function setBonusRuleEnabled(id: string, enabled: boolean): void {
  rules = rules.map((r) => (r.id === id ? { ...r, enabled } : r))
  notifyRules()
}

/* --------------------------------- the grant store ------------------------- */

const GRANTS_DOC: Doc<BonusGrant[]> = persistedDoc<BonusGrant[]>(store, 'bonus.grants', {
  version: 1,
  initial: [],
})

let grants: BonusGrant[] = GRANTS_DOC.load() ?? []
let grantsVersion = 0
const grantListeners = new Set<() => void>()
function notifyGrants(): void {
  GRANTS_DOC.save(grants)
  grantsVersion += 1
  grantListeners.forEach((l) => l())
}

export function subscribeBonusGrants(l: () => void): () => void {
  grantListeners.add(l)
  return () => {
    grantListeners.delete(l)
  }
}
export function getBonusGrantsVersion(): number {
  return grantsVersion
}
export function getBonusGrants(): BonusGrant[] {
  return grants
}
export function grantsForPlayer(playerId: string): BonusGrant[] {
  return grants.filter((g) => g.playerId === playerId)
}
/** A player already holds a (live or past) grant from this rule — for `oncePerPlayer`. */
function hasGrantFromRule(playerId: string, ruleId: string): boolean {
  return grants.some((g) => g.playerId === playerId && g.ruleId === ruleId)
}

let grantSeq = 0
function nextGrantId(now: number): string {
  grantSeq += 1
  return `bg_${now}_${grantSeq}`
}

/* --------------------------------- eligibility context --------------------- */

/** The player's ancestor ids (agent → sub-agent → manager) — for the downline filter. */
function agentChainOf(org: Org, playerId: string): string[] {
  const chain: string[] = []
  let cur = org.members[playerId]
  while (cur?.parentId) {
    chain.push(cur.parentId)
    cur = org.members[cur.parentId]
  }
  return chain
}

/** Build the resolved facts `isEligible` reads, from the org + the rewards state. */
export function eligibilityContext(org: Org, playerId: string): EligibilityContext {
  const m = getMember(org, playerId)
  const wageredCredits = Math.round(getPlayerRewards(playerId).wagered / 100)
  const tier = tierForStatus(getRewardsConfig().tiers, wageredCredits)
  const balanceCents = m.account.balance
  return {
    playerId,
    tierId: tier.id,
    segment: playerSegment(wageredCredits, balanceCents),
    agentChain: agentChainOf(org, playerId),
    balanceCents,
    active: m.active,
  }
}

/* --------------------------------- firing a trigger ------------------------ */

/** What a trigger carries: the player(s) it concerns + any amounts a reward is sized on. */
export interface TriggerOpts extends RewardContext {
  /** A single player the trigger concerns (signup/deposit/first-bet/losing-streak). */
  playerId?: string
  /** OR a target whose downline players are all considered (daily/manual bulk). */
  targetId?: string
  /** Override "now" (tests / deterministic seeds). Defaults to Date.now(). */
  now?: number
}

/** The players a trigger considers: an explicit player, or every active player under a
 *  target (an agent/sub-agent/manager), or — absent both — every active player. */
function triggerPlayers(org: Org, opts: TriggerOpts): Member[] {
  if (opts.playerId) return [getMember(org, opts.playerId)]
  if (opts.targetId) {
    const t = getMember(org, opts.targetId)
    if (t.role === 'player') return [t]
    return downline(org, opts.targetId).filter((m) => m.role === 'player' && m.active)
  }
  return membersByRole(org, 'player').filter((m) => m.active)
}

export interface FireResult {
  granted: BonusGrant[]
  /** Players considered but skipped (ineligible / already held / capped out). */
  skipped: number
}

/**
 * Fire every enabled rule bound to `trigger` for the player(s) the trigger concerns,
 * granting the (eligibility-gated, max-win-capped) reward through core. Returns the grants
 * created. Money moves ONLY here, via `core.grant` inside `mutateBook`; never a direct poke.
 */
export function fireTrigger(trigger: BonusTrigger, opts: TriggerOpts = {}): FireResult {
  const now = opts.now ?? Date.now()
  const org = getBook()
  const live = rules.filter((r) => r.enabled && r.trigger === trigger)
  const players = triggerPlayers(org, opts)
  const created: BonusGrant[] = []
  let skipped = 0

  for (const rule of live) {
    for (const player of players) {
      if (rule.oncePerPlayer && hasGrantFromRule(player.id, rule.id)) {
        skipped += 1
        continue
      }
      if (!isEligible(rule, eligibilityContext(org, player.id))) {
        skipped += 1
        continue
      }

      // free-spins: a count, not credit — granted through the rewards hub, no playthrough.
      if (rule.reward.kind === 'free-spins') {
        const spins = rule.reward.spins ?? 0
        if (spins <= 0) {
          skipped += 1
          continue
        }
        grantFreeSpins(player.id, spins)
        const ticket: BonusGrant = {
          id: nextGrantId(now),
          ruleId: rule.id,
          ruleName: rule.name,
          trigger,
          playerId: player.id,
          playerName: player.name,
          grantedCents: 0,
          requiredTurnoverCents: 0,
          turnoverCents: 0,
          maxWinCents: rule.maxWinCents,
          status: 'cleared',
          grantedAt: now,
          expiresAt: now + rule.expiryMs,
          clearedAt: now,
          spins,
        }
        grants = [ticket, ...grants]
        created.push(ticket)
        continue
      }

      const grantCents = rewardGrantCents(rule, opts)
      if (grantCents <= 0) {
        skipped += 1
        continue
      }
      // Respect the economy's issuance caps — the same gate every reward path checks.
      if (!canIssue(Math.round(grantCents / 100), now).ok) {
        skipped += 1
        continue
      }

      // THE money move: core.grant inside mutateBook (persists + fires GrantEvent).
      mutateBook(() => {
        grant(player.account, grantCents, { bonus: rule.id, type: 'bonus', trigger })
      })
      recordIssuance('bonus', Math.round(grantCents / 100), now)

      const required = requiredTurnoverCents(rule, grantCents)
      const ticket: BonusGrant = {
        id: nextGrantId(now),
        ruleId: rule.id,
        ruleName: rule.name,
        trigger,
        playerId: player.id,
        playerName: player.name,
        grantedCents: grantCents,
        requiredTurnoverCents: required,
        turnoverCents: 0,
        maxWinCents: rule.maxWinCents,
        // A zero-playthrough bonus clears the instant it's granted.
        status: required === 0 ? 'cleared' : 'active',
        grantedAt: now,
        expiresAt: now + rule.expiryMs,
        clearedAt: required === 0 ? now : undefined,
      }
      grants = [ticket, ...grants]
      created.push(ticket)
    }
  }

  if (created.length > 0) notifyGrants()
  return { granted: created, skipped }
}

/* --------------------------------- playthrough → clear --------------------- */

/**
 * Feed a real wager's stake into every ACTIVE grant for the player: turnover accrues and,
 * once it reaches the requirement, the grant CLEARS — a state flip only (the credits are
 * already in the core balance). Returns the grants that just cleared. Moves no money.
 */
export function recordTurnover(playerId: string, stakeCents: number, now = Date.now()): BonusGrant[] {
  if (stakeCents <= 0) return []
  const cleared: BonusGrant[] = []
  let touched = false
  grants = grants.map((g) => {
    if (g.playerId !== playerId || g.status !== 'active') return g
    touched = true
    const turnoverCents = g.turnoverCents + stakeCents
    if (turnoverCents >= g.requiredTurnoverCents) {
      const next: BonusGrant = { ...g, turnoverCents: g.requiredTurnoverCents, status: 'cleared', clearedAt: now }
      cleared.push(next)
      return next
    }
    return { ...g, turnoverCents }
  })
  if (touched) notifyGrants()
  return cleared
}

/* --------------------------------- expiry → clawback ----------------------- */

/**
 * Claw back every ACTIVE grant whose expiry has passed: the uncleared bonus is removed from
 * the figure via `adjustFigure` (a negative core adjustment, audited), and the ticket is
 * marked expired. A grant that already cleared keeps its credits. Returns the grants clawed
 * back. The ONLY negative money move in the engine — and it goes through core.
 */
export function expireDue(now = Date.now()): BonusGrant[] {
  const expired: BonusGrant[] = []
  grants = grants.map((g) => {
    if (g.status !== 'active' || now < g.expiresAt) return g
    if (g.grantedCents > 0) {
      try {
        adjustFigure(g.playerId, -g.grantedCents, `Bonus expired — clawback (${g.ruleName})`, 'bonus-engine')
      } catch {
        // member gone from the book (edge) — still mark the ticket expired below.
      }
    }
    const next: BonusGrant = { ...g, status: 'expired', expiredAt: now }
    expired.push(next)
    return next
  })
  if (expired.length > 0) notifyGrants()
  return expired
}

/* --------------------------------- live wiring (opt-in) -------------------- */

let armed: (() => void) | null = null

/**
 * Connect the engine to real play: every wager placed feeds `recordTurnover`, so bonuses
 * clear from actual betting. Idempotent — returns the existing unsubscribe if already armed.
 *
 * // SEAM: the wiring pass calls this at app start (and the console panel calls it on mount).
 * Trigger firing (signup/first-bet/daily) is left to the wiring pass to connect to the real
 * lifecycle events — the engine never auto-grants money on import.
 */
export function armBonusEngine(): () => void {
  if (armed) return armed
  const off = onWagerPlaced((e) => {
    try {
      recordTurnover(e.accountId, e.stake)
    } catch {
      /* a turnover update must never break placement */
    }
  })
  armed = () => {
    off()
    armed = null
  }
  return armed
}

/* --------------------------------- demo seed ------------------------------- */
// DISPLAY-ONLY: inserts ticket RECORDS for the seeded players so the console renders fully
// populated (mid-playthrough + cleared + clawed-back). It does NOT call core/grant — the
// credits are conceptually part of the players' seeded figures — so seeding never perturbs
// the shared book or other suites. The LIVE path (fireTrigger/expireDue) is what moves money.

let seeded = false

export function seedBonusDemo(now: number): void {
  if (seeded || grants.length > 0) {
    seeded = true
    return
  }
  const day = DAY
  const demo: BonusGrant[] = [
    {
      id: 'bg_seed_dana', ruleId: 'reload-match', ruleName: 'Reload Match 50%', trigger: 'deposit',
      playerId: 'p-dana', playerName: 'Dana (VIP)', grantedCents: 5_000_00, requiredTurnoverCents: 25_000_00,
      turnoverCents: 17_400_00, maxWinCents: 5_000_00, status: 'active', grantedAt: now - 2 * day, expiresAt: now + 5 * day,
    },
    {
      id: 'bg_seed_lena', ruleId: 'welcome-credit', ruleName: 'Welcome Bonus', trigger: 'signup',
      playerId: 'p-lena', playerName: 'Lena', grantedCents: 500_00, requiredTurnoverCents: 1_500_00,
      turnoverCents: 600_00, maxWinCents: 2_000_00, status: 'active', grantedAt: now - 1 * day, expiresAt: now + 13 * day,
    },
    {
      id: 'bg_seed_priya', ruleId: 'first-bet-boost', ruleName: 'First-Bet Free Play', trigger: 'first-bet',
      playerId: 'p-priya', playerName: 'Priya', grantedCents: 250_00, requiredTurnoverCents: 250_00,
      turnoverCents: 250_00, maxWinCents: 1_000_00, status: 'cleared', grantedAt: now - 3 * day, expiresAt: now + 4 * day, clearedAt: now - 2 * day,
    },
    {
      id: 'bg_seed_tariq', ruleId: 'comeback-rakeback', ruleName: 'Comeback Rakeback 10%', trigger: 'losing-streak',
      playerId: 'p-tariq', playerName: 'Tariq', grantedCents: 800_00, requiredTurnoverCents: 1_600_00,
      turnoverCents: 400_00, maxWinCents: 2_500_00, status: 'expired', grantedAt: now - 8 * day, expiresAt: now - 3 * day, expiredAt: now - 3 * day,
    },
    {
      id: 'bg_seed_marco', ruleId: 'daily-spins', ruleName: 'Daily Free Spins', trigger: 'daily',
      playerId: 'p-marco', playerName: 'Marco', grantedCents: 0, requiredTurnoverCents: 0, turnoverCents: 0,
      maxWinCents: null, status: 'cleared', grantedAt: now - 1 * day, expiresAt: now, clearedAt: now - 1 * day, spins: 3,
    },
  ]
  grants = [...demo, ...grants]
  seeded = true
  notifyGrants()
}

/* --------------------------------- test reset ------------------------------ */

export function __resetBonusEngine(): void {
  rules = DEFAULT_RULES.map((r) => ({ ...r }))
  grants = []
  seeded = false
  grantSeq = 0
  if (armed) armed()
  notifyRules()
  notifyGrants()
}
