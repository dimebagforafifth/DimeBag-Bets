/**
 * Referral store — the money-bearing flow. Proves a qualifying referral grants BOTH parties
 * through core (audited, figure up), the anti-abuse gates hold, the reward respects config, and
 * no program = a pure no-op.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Member } from '../org/index.js'
import { placeWager, resolveWager } from '../core/index.js'
import { getBook } from '../app/book-store.js'
import { getAuditLog } from '../app/audit-store.js'
import { setViewer } from '../app/viewer.js'
import {
  __resetReferrals,
  allReferrals,
  claimReferral,
  createCode,
  getReferralConfig,
  refereeReferral,
  setReferralActivityReader,
  setReferralConfig,
  tryQualify,
} from './index.js'

function players(): Member[] {
  return Object.values(getBook().members).filter((m) => m.role === 'player')
}
const enable = (over: Partial<ReturnType<typeof getReferralConfig>> = {}) =>
  setReferralConfig({ enabled: true, rewardCents: 5000, minSettledWagers: 1, ...over })

let referrer: Member
let referee: Member
beforeEach(() => {
  __resetReferrals()
  setViewer('mgr', 'manager') // only a manager configures the program
  const ps = players()
  referrer = ps[0]
  referee = ps[1]
  // The default reader counts the durable ledger — a referee with no settled wager reads 0.
  // Tests that need a controlled count call setReferralActivityReader explicitly.
})
afterEach(() => __resetReferrals())

describe('off-by-default', () => {
  it('no program → no code, no qualify, no money', () => {
    expect(createCode(referrer.id).ok).toBe(false)
    const before = referee.account.balance
    expect(tryQualify(referee.id).rewarded).toBe(false)
    expect(referee.account.balance).toBe(before)
  })
})

describe('a qualifying referral grants BOTH parties via core (audited)', () => {
  it('figures up by the configured reward, with two audit entries', () => {
    enable({ rewardCents: 5000 })
    const code = createCode(referrer.id).code!
    expect(claimReferral(code, referee.id).ok).toBe(true)

    // Signup alone does not pay.
    expect(tryQualify(referee.id).rewarded).toBe(false)

    // Now the referee has a settled wager → both qualify.
    setReferralActivityReader(() => 1)
    const rBefore = referrer.account.balance
    const eBefore = referee.account.balance
    const auditBefore = getAuditLog().length

    const res = tryQualify(referee.id)
    expect(res).toMatchObject({ rewarded: true, rewardCents: 5000 })
    expect(referrer.account.balance).toBe(rBefore + 5000)
    expect(referee.account.balance).toBe(eBefore + 5000)
    expect(refereeReferral(referee.id)?.status).toBe('rewarded')

    const newAudits = getAuditLog().slice(0, getAuditLog().length - auditBefore)
    expect(newAudits).toHaveLength(2)
    expect(newAudits.every((a) => a.action === 'credit' && /[Rr]eferral/.test(a.detail))).toBe(true)
  })

  it('respects the configured amount', () => {
    enable({ rewardCents: 2500 })
    const code = createCode(referrer.id).code!
    claimReferral(code, referee.id)
    setReferralActivityReader(() => 1)
    const eBefore = referee.account.balance
    tryQualify(referee.id)
    expect(referee.account.balance).toBe(eBefore + 2500)
  })
})

describe('anti-abuse', () => {
  it('blocks self-referral (referrer must be distinct)', () => {
    enable()
    const code = createCode(referrer.id).code!
    expect(claimReferral(code, referrer.id).ok).toBe(false)
  })

  it('one reward per referee — a second claim and a re-qualify never double-pay', () => {
    enable({ rewardCents: 5000 })
    const code = createCode(referrer.id).code!
    claimReferral(code, referee.id)
    setReferralActivityReader(() => 3)

    expect(tryQualify(referee.id).rewarded).toBe(true)
    const eBalance = referee.account.balance

    // Re-qualify is idempotent (already rewarded, no longer pending).
    expect(tryQualify(referee.id).rewarded).toBe(false)
    // A second claim by the same referee is refused.
    expect(claimReferral(code, referee.id).ok).toBe(false)
    expect(referee.account.balance).toBe(eBalance) // no extra credit
  })

  it('a bad / unknown code can’t be claimed', () => {
    enable()
    expect(claimReferral('INV-NOPE', referee.id).ok).toBe(false)
  })

  it('never pays one party only — a missing member leaves the invite pending (all-or-nothing)', () => {
    enable({ rewardCents: 5000 })
    const code = createCode(referrer.id).code!
    claimReferral(code, 'ghost-referee') // a referee that isn't on the book
    setReferralActivityReader(() => 1)

    const rBefore = referrer.account.balance
    const res = tryQualify('ghost-referee')
    expect(res.rewarded).toBe(false)
    expect(referrer.account.balance).toBe(rBefore) // the present party was NOT paid
    expect(refereeReferral('ghost-referee')?.status).toBe('pending') // still retryable
  })
})

describe('end to end via the real durable ledger', () => {
  it('a real settled wager qualifies the referee (default ledger activity reader)', () => {
    enable({ rewardCents: 4000, minSettledWagers: 1 })
    const code = createCode(referrer.id).code!
    claimReferral(code, referee.id) // claimedAt = now
    // Default reader counts the durable ledger — referee has nothing settled yet.
    expect(tryQualify(referee.id).rewarded).toBe(false)

    // Place + resolve a real wager → a durable 'resolve' row lands for the referee.
    const w = placeWager(referee.account, 100)
    resolveWager(referee.account, w, 'loss')

    const rBefore = referrer.account.balance
    const res = tryQualify(referee.id)
    expect(res.rewarded).toBe(true)
    expect(referrer.account.balance).toBe(rBefore + 4000)
    expect(allReferrals().find((r) => r.refereeId === referee.id)?.status).toBe('rewarded')
  })
})
