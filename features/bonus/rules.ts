/**
 * The bonus RULES model + its pure logic (CLAUDE.md §3, §4) — the no-code rules engine.
 *
 * An operator composes a bonus as DATA: a TRIGGER (what fires it), a REWARD (what the
 * player gets), ELIGIBILITY (who qualifies), a PLAYTHROUGH (how much they must wager to
 * clear it), an EXPIRY, and a MAX-WIN/conversion cap. This file is the schema for that
 * data plus the PURE functions that read it — who qualifies, what a reward is worth, how
 * much turnover clears it. It moves NO money and touches NO store; the engine (engine.ts)
 * applies a rule through core.
 *
 * CREDITS ONLY. Every amount is integer CENTS of the shared figure (core's money model) —
 * never cash, cash value, or a withdrawal. "Bonus credits" vs "cleared balance" is a STATE
 * a grant carries, not a second money path: the credits live in the one core balance; the
 * state just says whether the playthrough has cleared them.
 */

/* ------------------------------- the rule schema --------------------------- */

/** What makes a bonus fire. The engine calls `fireTrigger(trigger, …)` for each. */
export type BonusTrigger =
  | 'signup' // a new player's first session
  | 'deposit' // a top-up / reload (carries an amount)
  | 'first-bet' // the player's first ever wager
  | 'losing-streak' // N losses in a row (a retention nudge)
  | 'daily' // a daily check-in reward
  | 'manual' // the operator grants it by hand

/**
 * How the reward is sized. Each kind is just a different FORMULA for the grant cents; the
 * resulting credit then flows through the ONE core grant + playthrough + expiry mechanic.
 *  - credit:       a flat `valueCents`.
 *  - match:        `pct`% of the trigger amount (a deposit/top-up match), capped by max-win.
 *  - rakeback:     `pct`% of the player's recent losses (a loss-back boost).
 *  - profit-boost: a credit-equivalent estimate (`pct`% of a reference stake) — modelled as
 *                  a credit grant so it rides the same audited path.
 *  - free-spins:   `spins` free spins (a count, granted via the rewards hub) — NOT a credit
 *                  grant, so it carries no playthrough/clawback.
 */
export type RewardKind = 'credit' | 'match' | 'rakeback' | 'profit-boost' | 'free-spins'

export interface BonusReward {
  kind: RewardKind
  /** Flat grant for `credit` (cents). */
  valueCents?: number
  /** Percentage for `match` / `rakeback` / `profit-boost` (e.g. 50 = 50%). */
  pct?: number
  /** Free-spin count for `free-spins`. */
  spins?: number
}

/**
 * Who qualifies. Every filter is optional and ANDed — an empty eligibility matches every
 * player. Resolved against a player's derived context (tier, segment, agent chain, figure),
 * so the rule stays pure data.
 */
export interface BonusEligibility {
  /** Tier ids the player must be in (e.g. ['gold','platinum','diamond']). */
  tiers?: string[]
  /** Derived segments the player must be in (see `playerSegment`). */
  segments?: PlayerSegment[]
  /** Restrict to a given agent/sub-agent/manager's downline. */
  agentId?: string
  /** Figure (balance, cents) floor/ceiling — e.g. target players who are down. */
  minBalanceCents?: number
  maxBalanceCents?: number
}

export interface BonusRule {
  id: string
  name: string
  enabled: boolean
  trigger: BonusTrigger
  reward: BonusReward
  eligibility: BonusEligibility
  /** Wager multiple of the granted credit the player must turn over before the bonus
   *  CLEARS from "bonus credits" to normal balance. 0 = clears instantly (no lock). */
  playthroughX: number
  /** How long (ms) until an uncleared grant expires and is clawed back. */
  expiryMs: number
  /** Conversion / max-win cap (cents): the ceiling on what this bonus can be worth to the
   *  player — the "up to $X" cap. Applied when the reward is computed. null = uncapped. */
  maxWinCents: number | null
  /** At most one live grant per player from this rule (one-shot triggers like signup). */
  oncePerPlayer?: boolean
}

/* ------------------------------- derived segments -------------------------- */

/** A lightweight behavioural segment derived from a player's lifetime play + figure — so a
 *  rule can target "new", "VIP", or "down/at-risk" players without a separate CRM store. */
export type PlayerSegment = 'new' | 'casual' | 'vip' | 'at-risk' | 'winning'

/** The thresholds (credits wagered) that bound the segments — kept here so the rule UI and
 *  the engine agree on what "new"/"vip" mean. */
export const SEGMENT_VIP_WAGERED = 50_000 // Gold ladder floor
export const SEGMENT_NEW_WAGERED = 10_000 // below Silver

/**
 * The segment a player falls in, from lifetime credits WAGERED and their current figure
 * (cents). Pure. A player who's down is "at-risk" (a retention target) regardless of volume;
 * otherwise VIP / new / winning / casual by volume + standing.
 */
export function playerSegment(wageredCredits: number, balanceCents: number): PlayerSegment {
  if (balanceCents < 0) return 'at-risk'
  if (wageredCredits >= SEGMENT_VIP_WAGERED) return 'vip'
  if (wageredCredits < SEGMENT_NEW_WAGERED) return 'new'
  if (balanceCents > 0) return 'winning'
  return 'casual'
}

/* ------------------------------- eligibility ------------------------------- */

/** The resolved facts about a player an eligibility check reads — built by the engine from
 *  the org + rewards state so `isEligible` stays a pure function of data. */
export interface EligibilityContext {
  playerId: string
  tierId: string
  segment: PlayerSegment
  /** The player's ancestor ids (agent, sub-agent, manager) — for the downline filter. */
  agentChain: string[]
  balanceCents: number
  active: boolean
}

/** Whether a player qualifies for a rule. A suspended player never qualifies (Suspend means
 *  "no new action"). Every set filter must pass; an empty filter matches all. Pure. */
export function isEligible(rule: BonusRule, ctx: EligibilityContext): boolean {
  if (!rule.enabled) return false
  if (!ctx.active) return false
  const e = rule.eligibility
  if (e.tiers && e.tiers.length > 0 && !e.tiers.includes(ctx.tierId)) return false
  if (e.segments && e.segments.length > 0 && !e.segments.includes(ctx.segment)) return false
  if (e.agentId && !ctx.agentChain.includes(e.agentId)) return false
  if (e.minBalanceCents != null && ctx.balanceCents < e.minBalanceCents) return false
  if (e.maxBalanceCents != null && ctx.balanceCents > e.maxBalanceCents) return false
  return true
}

/* ------------------------------- reward sizing ----------------------------- */

/** The context a reward is sized against — a deposit/top-up amount, the player's recent
 *  losses, a reference stake. All cents; absent fields default to 0. */
export interface RewardContext {
  /** The amount that triggered a deposit/match bonus (cents). */
  amountCents?: number
  /** The player's recent net losses, for a rakeback reward (cents, positive). */
  lossesCents?: number
  /** A reference stake for a profit-boost estimate (cents). */
  refStakeCents?: number
}

/**
 * What a reward grants, in CENTS, BEFORE the max-win cap — the raw formula per kind. Returns
 * 0 for `free-spins` (which grants a spin count, not credit) and for a non-positive result.
 * Pure.
 */
export function rawRewardCents(reward: BonusReward, ctx: RewardContext = {}): number {
  const pct = reward.pct ?? 0
  let cents = 0
  switch (reward.kind) {
    case 'credit':
      cents = reward.valueCents ?? 0
      break
    case 'match':
      cents = Math.round(((ctx.amountCents ?? 0) * pct) / 100)
      break
    case 'rakeback':
      cents = Math.round(((ctx.lossesCents ?? 0) * pct) / 100)
      break
    case 'profit-boost':
      cents = Math.round(((ctx.refStakeCents ?? 0) * pct) / 100)
      break
    case 'free-spins':
      cents = 0
      break
  }
  return Math.max(0, Math.floor(cents))
}

/**
 * The credit a reward grants in CENTS, AFTER the max-win/conversion cap (the "up to $X"
 * ceiling). This is the single place the cap is enforced, so a percentage match can never
 * over-issue. Pure.
 */
export function rewardGrantCents(rule: BonusRule, ctx: RewardContext = {}): number {
  const raw = rawRewardCents(rule.reward, ctx)
  if (rule.maxWinCents != null) return Math.min(raw, rule.maxWinCents)
  return raw
}

/**
 * The turnover (cents) a player must wager to CLEAR a grant of `grantCents`:
 * `grantCents × playthroughX`. 0 multiplier ⇒ 0 (clears instantly). Pure.
 */
export function requiredTurnoverCents(rule: BonusRule, grantCents: number): number {
  return Math.max(0, Math.round(grantCents * rule.playthroughX))
}
