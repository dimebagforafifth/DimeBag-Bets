/**
 * Referral store — the app-layer owner of the referral program: persisted config + invites, the
 * audited core grant, and the qualify-on-settled-activity hook.
 *
 * MONEY SAFETY: a reward is issued ONLY through the core grant path — `mutateBook(grant(...))` —
 * gated by the shared issuance cap (`canIssue`) and recorded to the audit trail + issuance ledger,
 * exactly like the bonus engine. No new money path, no direct balance write. OFF-BY-DEFAULT: with
 * no program enabled (the default) nothing is issued and figures are byte-identical to today.
 *
 * ANTI-ABUSE: a referee may be referred only once (one reward per referee), the referrer must be
 * distinct from the referee (no self-referral), and qualifying is gated on REAL settled activity
 * counted from the durable ledger (signup alone never pays — stops self-referral farming).
 */

import { grant, onWagerResolved } from '../core/index.js'
import { getBook, mutateBook } from '../app/book-store.js'
import { getBookLedger } from '../app/book-ledger.js'
import { recordAudit } from '../app/audit-store.js'
import { getViewer } from '../app/viewer.js'
import { canIssue, recordIssuance, __resetIssuance } from '../rewards/economy.js'
import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import { formatMoney } from '../games/shared/money.js'
import { generateCode, claimGuard, qualifies } from './engine.js'
import {
  DEFAULT_REFERRAL_CONFIG,
  type Referral,
  type ReferralConfig,
  type ReferralResult,
} from './types.js'

interface ReferralState {
  config: ReferralConfig
  /** A referrer's stable personal invite code (one per referrer; claimable by many referees). */
  codes: Record<string, string>
  /** One row per claimed invite (a referrer↔referee relationship). */
  referrals: Referral[]
  seq: number
}

const DEFAULT_STATE: ReferralState = {
  config: DEFAULT_REFERRAL_CONFIG,
  codes: {},
  referrals: [],
  seq: 0,
}

const ACTOR = 'referrals'

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<ReferralState> = persistedDoc<ReferralState>(store, 'referrals.state', {
  version: 1,
  initial: DEFAULT_STATE,
})

let state: ReferralState = DOC.load() ?? DEFAULT_STATE
let version = 0
const listeners = new Set<() => void>()

function notify(): void {
  DOC.save(state)
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeReferrals(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function getReferralsVersion(): number {
  return version
}

/* ------------------------------- activity seam ----------------------------- */

/** Count a referee's RESOLVED (settled) wagers at/after `sinceMs` — the qualifying signal,
 *  read from the durable ledger. Injectable so tests can pin it deterministically. */
export type ReferralActivityReader = (refereeId: string, sinceMs: number) => number

const ledgerActivityReader: ReferralActivityReader = (refereeId, sinceMs) =>
  getBookLedger().filter(
    (e) => e.accountId === refereeId && e.kind === 'resolve' && e.at >= sinceMs,
  ).length

let activityReader: ReferralActivityReader = ledgerActivityReader

/** Point qualification at a different settled-activity source (tests; or a server reader). */
export function setReferralActivityReader(reader: ReferralActivityReader): void {
  activityReader = reader
}

/* --------------------------------- config ---------------------------------- */

export function getReferralConfig(): ReferralConfig {
  return state.config
}

/** Only the manager configures the program (agents inherit it). */
export function canConfigureReferrals(): boolean {
  return getViewer().role === 'manager'
}

/** Set the program config (manager only). Throws (changing nothing) for a non-manager. */
export function setReferralConfig(patch: Partial<ReferralConfig>): void {
  if (!canConfigureReferrals()) {
    throw new Error('only the manager can configure the referral program')
  }
  const next = { ...state.config, ...patch }
  next.rewardCents = Math.max(0, Math.round(next.rewardCents))
  next.minSettledWagers = Math.max(1, Math.round(next.minSettledWagers))
  state = { ...state, config: next }
  notify()
}

/* ------------------------------- the invite -------------------------------- */

/** A referrer's stable invite code, if they have one (no side effect). */
export function personalCodeOf(referrerId: string): string | null {
  return state.codes[referrerId] ?? null
}

/**
 * Get (or mint) a referrer's stable invite code. Requires an active program — off-by-default,
 * no code exists until an operator enables referrals.
 */
export function createCode(referrerId: string): { ok: boolean; code?: string; reason?: string } {
  if (!state.config.enabled) return { ok: false, reason: 'No referral program is active.' }
  if (!referrerId) return { ok: false, reason: 'A referrer is required.' }
  const existing = state.codes[referrerId]
  if (existing) return { ok: true, code: existing }
  const code = generateCode(state.seq) // 0-based → INV-0001 for the first
  state = { ...state, seq: state.seq + 1, codes: { ...state.codes, [referrerId]: code } }
  notify()
  return { ok: true, code }
}

/** Resolve an invite code back to its referrer (null if unknown). */
function referrerOfCode(code: string): string | null {
  const entry = Object.entries(state.codes).find(([, c]) => c === code.trim())
  return entry ? entry[0] : null
}

/** Whether `refereeId` has already been referred (claimed any invite) — one reward per referee. */
function alreadyReferred(refereeId: string): boolean {
  return state.referrals.some((r) => r.refereeId === refereeId)
}

/**
 * A referee claims an invite code (signup). Records the pending relationship; the reward is NOT
 * issued yet — that waits for qualifying settled activity. Anti-abuse: program must be enabled,
 * the code must resolve, the referee must be distinct from the referrer, and a referee may claim
 * only once.
 */
export function claimReferral(
  code: string,
  refereeId: string,
  now: number = Date.now(),
): ReferralResult {
  if (!state.config.enabled) return { ok: false, reason: 'No referral program is active.' }
  const referrerId = referrerOfCode(code)
  if (!referrerId) return { ok: false, reason: 'That invite code isn’t valid.' }
  if (alreadyReferred(refereeId)) {
    return { ok: false, reason: 'This account has already used an invite.' }
  }
  // Reuse the per-invite guard (distinct referrer, etc.) against a fresh pending shell.
  const shell: Referral = {
    code,
    referrerId,
    refereeId: null,
    status: 'pending',
    rewardCents: state.config.rewardCents,
    createdAt: now,
    claimedAt: null,
    qualifiedAt: null,
  }
  const guard = claimGuard(shell, refereeId)
  if (!guard.ok) return guard

  const referral: Referral = {
    ...shell,
    refereeId,
    claimedAt: now, // qualifying activity is counted from here
  }
  state = { ...state, referrals: [referral, ...state.referrals] }
  notify()
  return { ok: true }
}

/* ------------------------------ the audited grant -------------------------- */

/** Issue `cents` to a member through the CORE grant path, audited + issuance-recorded. Returns
 *  false if the member is unknown or the amount is non-positive. (Caller pre-checks the cap.) */
function grantReferral(memberId: string, cents: number, reason: string, now: number): boolean {
  const member = getBook().members[memberId]
  if (!member || cents <= 0) return false
  mutateBook(() => grant(member.account, cents, { type: 'referral', reason }))
  recordIssuance('referral', Math.round(cents / 100), now)
  recordAudit({
    actor: ACTOR,
    action: 'credit',
    memberId,
    memberName: member.name,
    detail: `+${formatMoney(cents)} — ${reason}`,
  })
  return true
}

/* ------------------------------- qualification ----------------------------- */

export interface QualifyResult {
  rewarded: boolean
  rewardCents?: number
  reason?: string
}

/**
 * Attempt to qualify + reward the referee's pending invite. Idempotent and safe to call on every
 * settled wager: a no-op unless the program is on, the referee has a pending claimed invite, and
 * their settled activity (counted from claim) meets the rule. On success BOTH parties are granted
 * the snapshot reward through core and the invite flips to `rewarded`.
 */
export function tryQualify(refereeId: string, now: number = Date.now()): QualifyResult {
  if (!state.config.enabled) return { rewarded: false }
  const idx = state.referrals.findIndex((r) => r.refereeId === refereeId && r.status === 'pending')
  if (idx < 0) return { rewarded: false }
  const referral = state.referrals[idx]

  const since = referral.claimedAt ?? referral.createdAt
  const settled = activityReader(refereeId, since)
  if (!qualifies(settled, state.config)) return { rewarded: false, reason: 'not yet qualified' }

  const reward = referral.rewardCents
  if (reward > 0) {
    // Both parties must still be on the book — never advance to `rewarded` having paid only one
    // (e.g. a referrer removed between claim and qualify); leave it pending to retry.
    const members = getBook().members
    if (!members[referral.referrerId] || !members[refereeId]) {
      return { rewarded: false, reason: 'a party is no longer on the book' }
    }
    // All-or-nothing against the shared issuance cap (both parties or neither). The cap units
    // match what the two grants record (per-party rounding, doubled), so no accounting drift.
    const perPartyUnits = Math.round(reward / 100)
    if (!canIssue(perPartyUnits * 2, now).ok) {
      return { rewarded: false, reason: 'issuance cap reached' }
    }
    grantReferral(referral.referrerId, reward, 'Referral reward (your invite qualified)', now)
    grantReferral(refereeId, reward, 'Referral welcome reward', now)
  }

  const updated: Referral = { ...referral, status: 'rewarded', qualifiedAt: now }
  const referrals = state.referrals.slice()
  referrals[idx] = updated
  state = { ...state, referrals }
  notify()
  return { rewarded: true, rewardCents: reward }
}

/* --------------------------------- arming ---------------------------------- */

/**
 * Wire qualification to live settlements: every resolved wager re-checks the player's pending
 * invite. Returns an unsubscribe. // SEAM (wiring pass): call once at boot. Off-by-default — if
 * never armed, qualification only runs when called explicitly (operator action / test); and even
 * armed, a disabled program is a pure no-op.
 */
export function armReferrals(): () => void {
  return onWagerResolved((e) => {
    tryQualify(e.accountId, Date.now())
  })
}

/* ---------------------------------- reads ---------------------------------- */

/** Invites a referrer has sent (the relationships under their code). Newest first. */
export function referralsFor(referrerId: string): Referral[] {
  return state.referrals.filter((r) => r.referrerId === referrerId)
}

/** The invite a referee claimed, if any. */
export function refereeReferral(refereeId: string): Referral | null {
  return state.referrals.find((r) => r.refereeId === refereeId) ?? null
}

/** Every referral (operator view). Newest first. */
export function allReferrals(): Referral[] {
  return state.referrals
}

/* ------------------------------- test helper ------------------------------- */

/** Reset the program + invites + issuance ledger + activity reader to the off-by-default baseline. */
export function __resetReferrals(): void {
  state = { config: { ...DEFAULT_REFERRAL_CONFIG }, codes: {}, referrals: [], seq: 0 }
  DOC.save(state)
  version = 0
  activityReader = ledgerActivityReader
  __resetIssuance()
}
