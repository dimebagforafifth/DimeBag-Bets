/**
 * The bonus ENGINE — the live path, proving every credit move goes through core:
 *   - a trigger fires only for ELIGIBLE players and grants via core.grant (figure up, no
 *     pending, a GrantEvent fires);
 *   - PLAYTHROUGH gates conversion — clearing is a state flip that moves no money;
 *   - EXPIRY claws the uncleared bonus back through core (figure down);
 *   - the MAX-WIN cap bounds the grant;
 *   - a disabled rule and `oncePerPlayer` both no-op.
 *
 * Tests run against the shared book (the engine's real money path). Player figures are
 * snapshotted before each test and restored after, so the suite stays isolated.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getBook } from '../app/book-store.js'
import { onGrant } from '../core/index.js'
import {
  DEFAULT_RULES,
  upsertBonusRule,
  setBonusRuleEnabled,
  fireTrigger,
  recordTurnover,
  expireDue,
  grantsForPlayer,
  eligibilityContext,
  signupGrantPreviewCents,
  __resetBonusEngine,
} from './engine.js'
import type { BonusRule } from './rules.js'

const DAY = 86_400_000
const T = 1_750_000_000_000

const bal = (id: string): number => getBook().members[id].account.balance
const pending = (id: string): number => getBook().members[id].account.pending

let snap: Record<string, { balance: number; pending: number }> = {}

beforeEach(() => {
  __resetBonusEngine()
  // Disable the seeded defaults so each test authors exactly the rule it exercises.
  for (const r of DEFAULT_RULES) setBonusRuleEnabled(r.id, false)
  const org = getBook()
  snap = {}
  for (const m of Object.values(org.members)) snap[m.id] = { balance: m.account.balance, pending: m.account.pending }
})

afterEach(() => {
  const org = getBook()
  for (const m of Object.values(org.members)) {
    const s = snap[m.id]
    if (s) {
      m.account.balance = s.balance
      m.account.pending = s.pending
    }
  }
  __resetBonusEngine()
})

const credit = (over: Partial<BonusRule> = {}): BonusRule => ({
  id: 't-credit',
  name: 'Test Credit',
  enabled: true,
  trigger: 'manual',
  reward: { kind: 'credit', valueCents: 500_00 },
  eligibility: {},
  playthroughX: 2,
  expiryMs: 7 * DAY,
  maxWinCents: null,
  ...over,
})

describe('signupGrantPreviewCents (the honest onboarding welcome figure)', () => {
  it('sums the enabled, new-player-eligible signup credit rules, max-win capped', () => {
    // valueCents 800_00 but capped at 600_00, eligibility = new players → preview is the cap.
    upsertBonusRule(
      credit({
        id: 'welcome-test',
        trigger: 'signup',
        reward: { kind: 'credit', valueCents: 800_00 },
        eligibility: { segments: ['new'] },
        maxWinCents: 600_00,
      }),
    )
    expect(signupGrantPreviewCents()).toBe(600_00)
  })

  it('ignores disabled signup rules and rules a new player cannot qualify for', () => {
    upsertBonusRule(
      credit({ id: 'off', trigger: 'signup', enabled: false, reward: { kind: 'credit', valueCents: 100_00 } }),
    )
    upsertBonusRule(
      credit({
        id: 'vip-only',
        trigger: 'signup',
        reward: { kind: 'credit', valueCents: 100_00 },
        eligibility: { segments: ['vip'] }, // a fresh player is 'new', never 'vip'
      }),
    )
    expect(signupGrantPreviewCents()).toBe(0)
  })
})

describe('eligibilityContext (derived from the book + rewards state)', () => {
  it('resolves a seeded player to tier + segment + agent chain', () => {
    const ctx = eligibilityContext(getBook(), 'p-marco')
    expect(ctx.agentChain).toEqual(['a-e', 'sa-n', 'mgr'])
    expect(ctx.segment).toBe('at-risk') // seeded figure is negative
    expect(ctx.active).toBe(true)
  })
})

describe('fireTrigger — eligibility-gated, granted through core', () => {
  it('grants an eligible player via core.grant (figure up, no pending, GrantEvent fires)', () => {
    upsertBonusRule(credit({ eligibility: { segments: ['vip'] } }))
    const events: number[] = []
    const off = onGrant((e) => events.push(e.cents))
    const before = bal('p-lena') // lena is VIP (high volume)
    const beforePending = pending('p-lena')

    const res = fireTrigger('manual', { playerId: 'p-lena', now: T })
    off()

    expect(res.granted).toHaveLength(1)
    expect(bal('p-lena') - before).toBe(500_00) // credited through core
    expect(pending('p-lena')).toBe(beforePending) // a grant is NOT a wager
    expect(events).toContain(500_00) // core emitted the grant
  })

  it('skips an ineligible player (wrong segment) — no grant, no figure move', () => {
    upsertBonusRule(credit({ eligibility: { segments: ['vip'] } }))
    const before = bal('p-marco') // marco is at-risk, not VIP
    const res = fireTrigger('manual', { playerId: 'p-marco', now: T })
    expect(res.granted).toHaveLength(0)
    expect(bal('p-marco')).toBe(before)
  })

  it('a disabled rule never grants', () => {
    upsertBonusRule(credit({ enabled: false }))
    const before = bal('p-lena')
    const res = fireTrigger('manual', { playerId: 'p-lena', now: T })
    expect(res.granted).toHaveLength(0)
    expect(bal('p-lena')).toBe(before)
  })

  it('oncePerPlayer grants once then skips a repeat', () => {
    upsertBonusRule(credit({ oncePerPlayer: true }))
    expect(fireTrigger('manual', { playerId: 'p-priya', now: T }).granted).toHaveLength(1)
    const after1 = bal('p-priya')
    expect(fireTrigger('manual', { playerId: 'p-priya', now: T }).granted).toHaveLength(0)
    expect(bal('p-priya')).toBe(after1) // no second credit
  })
})

describe('playthrough gates conversion', () => {
  it('clears only once turnover reaches the requirement — a state flip, no money move', () => {
    upsertBonusRule(credit({ playthroughX: 2, reward: { kind: 'credit', valueCents: 500_00 } }))
    fireTrigger('manual', { playerId: 'p-priya', now: T })
    const g0 = grantsForPlayer('p-priya')[0]
    expect(g0.status).toBe('active')
    expect(g0.requiredTurnoverCents).toBe(1_000_00) // 500_00 × 2
    const balAfterGrant = bal('p-priya')

    expect(recordTurnover('p-priya', 400_00, T)).toHaveLength(0) // below requirement
    expect(grantsForPlayer('p-priya')[0].status).toBe('active')

    const cleared = recordTurnover('p-priya', 700_00, T) // crosses 1,000_00
    expect(cleared).toHaveLength(1)
    expect(grantsForPlayer('p-priya')[0].status).toBe('cleared')
    expect(bal('p-priya')).toBe(balAfterGrant) // conversion moves NO money
  })

  it('a zero-playthrough bonus is granted already cleared', () => {
    upsertBonusRule(credit({ playthroughX: 0 }))
    fireTrigger('manual', { playerId: 'p-priya', now: T })
    expect(grantsForPlayer('p-priya')[0].status).toBe('cleared')
  })
})

describe('expiry claws back through core', () => {
  it('removes the uncleared bonus from the figure (a negative core adjustment)', () => {
    upsertBonusRule(credit({ playthroughX: 5, expiryMs: DAY, reward: { kind: 'credit', valueCents: 500_00 } }))
    fireTrigger('manual', { playerId: 'p-priya', now: T })
    const balAfterGrant = bal('p-priya')

    const expired = expireDue(T + DAY + 1)
    expect(expired).toHaveLength(1)
    expect(grantsForPlayer('p-priya')[0].status).toBe('expired')
    expect(bal('p-priya')).toBe(balAfterGrant - 500_00) // clawed back via core
  })

  it('does NOT claw back a bonus that already cleared', () => {
    upsertBonusRule(credit({ playthroughX: 1, expiryMs: DAY, reward: { kind: 'credit', valueCents: 500_00 } }))
    fireTrigger('manual', { playerId: 'p-priya', now: T })
    recordTurnover('p-priya', 500_00, T) // clears it
    const balAfterClear = bal('p-priya')

    const expired = expireDue(T + DAY + 1)
    expect(expired).toHaveLength(0)
    expect(grantsForPlayer('p-priya')[0].status).toBe('cleared')
    expect(bal('p-priya')).toBe(balAfterClear) // untouched
  })
})

describe('max-win cap', () => {
  it('caps the granted credit (and the figure move) at the cap', () => {
    upsertBonusRule(credit({ reward: { kind: 'match', pct: 100 }, maxWinCents: 5_000_00 }))
    const before = bal('p-lena')
    fireTrigger('manual', { playerId: 'p-lena', amountCents: 12_000_00, now: T }) // 100% of 12k → capped 5k
    const g = grantsForPlayer('p-lena')[0]
    expect(g.grantedCents).toBe(5_000_00)
    expect(bal('p-lena') - before).toBe(5_000_00) // only the capped amount credited through core
  })
})
