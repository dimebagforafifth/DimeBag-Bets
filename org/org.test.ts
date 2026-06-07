import { describe, it, expect } from 'vitest'
import {
  addAgent,
  addMember,
  addPlayer,
  addSubAgent,
  allocatedCredit,
  availableCredit,
  bookFigure,
  createOrg,
  creditUtilization,
  directPlayers,
  downline,
  eligibleParents,
  getMember,
  membersByRole,
  playerCount,
  reassign,
  setActive,
  setCreditLimit,
  setMaxPayout,
  setMemberProfile,
  setMinWager,
  settleOrgWeek,
  settlementStatement,
} from './index.js'

/**
 * A small four-tier org with all the shapes the rules allow:
 *   manager
 *     ├── sub-agent (sa1)
 *     │     ├── agent (a1) ── player (p1)
 *     │     └── player (psa)        ← player directly under a sub-agent
 *     ├── agent (a0)                ← agent directly under the manager
 *     └── player (pm)               ← player directly under the manager
 */
function seedOrg() {
  const org = createOrg({ name: 'House', creditLimit: 1_000_000, id: 'mgr' })
  const sa1 = addSubAgent(org, { name: 'Sub One', creditLimit: 500_000, id: 'sa1' })
  const a1 = addAgent(org, 'sa1', { name: 'Agent One', creditLimit: 200_000, id: 'a1' })
  const a0 = addAgent(org, 'mgr', { name: 'Direct Agent', creditLimit: 200_000, id: 'a0' })
  const p1 = addPlayer(org, 'a1', { name: 'Player One', creditLimit: 10_000, id: 'p1' })
  const psa = addPlayer(org, 'sa1', { name: 'Sub Player', creditLimit: 10_000, id: 'psa' })
  const pm = addPlayer(org, 'mgr', { name: 'Direct Player', creditLimit: 10_000, id: 'pm' })
  return { org, sa1, a1, a0, p1, psa, pm }
}

describe('member profile', () => {
  it('every member starts with an empty profile, and accepts one at creation', () => {
    const { org } = seedOrg()
    expect(getMember(org, 'p1').profile).toEqual({})
    const vip = addPlayer(org, 'mgr', {
      name: 'VIP',
      creditLimit: 5000,
      id: 'vip',
      profile: { nickname: 'Ace', notes: 'high roller' },
    })
    expect(vip.profile).toEqual({ nickname: 'Ace', notes: 'high roller' })
  })

  it('setMemberProfile merges a patch without disturbing other fields or money', () => {
    const { org } = seedOrg()
    setMemberProfile(org, 'p1', { email: 'p1@book.test', notes: 'pays on time' })
    setMemberProfile(org, 'p1', { notes: 'late last week' }) // partial update
    const m = getMember(org, 'p1')
    expect(m.profile).toEqual({ email: 'p1@book.test', notes: 'late last week' })
    expect(m.account.creditLimit).toBe(10_000) // money untouched
  })
})

describe('tier placement rules', () => {
  it('creates an org rooted at a manager with no parent', () => {
    const org = createOrg({ name: 'House', id: 'mgr' })
    const m = getMember(org, 'mgr')
    expect(org.managerId).toBe('mgr')
    expect(m.role).toBe('manager')
    expect(m.parentId).toBeNull()
  })

  it('puts sub-agents directly under the manager', () => {
    const { org, sa1 } = seedOrg()
    expect(sa1.role).toBe('subagent')
    expect(sa1.parentId).toBe('mgr')
  })

  it('allows agents under a sub-agent OR directly under the manager', () => {
    const { org } = seedOrg()
    expect(getMember(org, 'a1').parentId).toBe('sa1')
    expect(getMember(org, 'a0').parentId).toBe('mgr')
  })

  it('allows players under an agent, a sub-agent, or the manager', () => {
    const { org } = seedOrg()
    expect(getMember(org, 'p1').parentId).toBe('a1') // under agent
    expect(getMember(org, 'psa').parentId).toBe('sa1') // under sub-agent
    expect(getMember(org, 'pm').parentId).toBe('mgr') // under manager
  })

  it('refuses to invert the tiers', () => {
    const { org } = seedOrg()
    expect(() => addAgent(org, 'a1', { name: 'nope' })).toThrow(/agent can't sit under a/) // agent under agent
    expect(() => addPlayer(org, 'p1', { name: 'nope' })).toThrow(/player can't sit under a/) // player under player
    // a sub-agent can only be under the manager — never under an agent
    expect(() => addMember(org, 'subagent', 'a1', { name: 'nope' })).toThrow(
      /sub-agent can't sit under an agent/,
    )
  })

  it('refuses to recruit under an inactive parent', () => {
    const { org } = seedOrg()
    setActive(org, 'sa1', false)
    expect(() => addAgent(org, 'sa1', { name: 'nope' })).toThrow(/inactive/)
  })

  it('lists eligible parents per role', () => {
    const { org } = seedOrg()
    expect(eligibleParents(org, 'subagent').map((m) => m.id)).toEqual(['mgr'])
    expect(eligibleParents(org, 'agent').map((m) => m.id).sort()).toEqual(['mgr', 'sa1'])
    expect(eligibleParents(org, 'player').map((m) => m.id).sort()).toEqual(
      ['a0', 'a1', 'mgr', 'sa1'].sort(),
    )
  })
})

describe('downline + counts', () => {
  it('lists the whole downline of the manager', () => {
    const { org } = seedOrg()
    expect(downline(org, 'mgr').map((m) => m.id).sort()).toEqual(
      ['a0', 'a1', 'p1', 'psa', 'pm', 'sa1'].sort(),
    )
  })

  it('counts players beneath each member', () => {
    const { org } = seedOrg()
    expect(playerCount(org, 'mgr')).toBe(3) // p1, psa, pm
    expect(playerCount(org, 'sa1')).toBe(2) // p1 (via a1), psa
    expect(playerCount(org, 'a1')).toBe(1) // p1
    expect(playerCount(org, 'a0')).toBe(0)
  })

  it('rolls every role up by membersByRole', () => {
    const { org } = seedOrg()
    expect(membersByRole(org, 'subagent').map((m) => m.id)).toEqual(['sa1'])
    expect(membersByRole(org, 'agent').map((m) => m.id).sort()).toEqual(['a0', 'a1'])
  })
})

describe('bookFigure rolls balances up the tree', () => {
  it("sums a member's own balance plus everyone beneath, across all four tiers", () => {
    const { org } = seedOrg()
    getMember(org, 'p1').account.balance = -3_000 // player under agent under sub-agent
    getMember(org, 'psa').account.balance = 1_000 // player under sub-agent
    getMember(org, 'pm').account.balance = -500 // player under manager
    getMember(org, 'a1').account.balance = 200 // agent-level adjustment

    expect(bookFigure(org, 'a1')).toBe(-3_000 + 200) // -2,800
    expect(bookFigure(org, 'sa1')).toBe(-3_000 + 200 + 1_000) // sub-agent's whole book = -1,800
    expect(bookFigure(org, 'mgr')).toBe(-3_000 + 200 + 1_000 - 500) // -2,300 (whole operation)
    expect(bookFigure(org, 'p1')).toBe(-3_000) // a leaf is just itself
  })
})

describe('reassigning members (manager tools)', () => {
  it('moves an agent to a different sub-agent', () => {
    const { org } = seedOrg()
    // sa2 needs the headroom to hold a1's 200,000 credit line
    const sa2 = addSubAgent(org, { name: 'Sub Two', creditLimit: 250_000, id: 'sa2' })
    reassign(org, 'a1', sa2.id)
    expect(getMember(org, 'a1').parentId).toBe('sa2')
  })

  it('moves a player up to the manager', () => {
    const { org } = seedOrg()
    reassign(org, 'p1', 'mgr')
    expect(getMember(org, 'p1').parentId).toBe('mgr')
    expect(directPlayers(org, 'mgr').map((p) => p.id).sort()).toEqual(['p1', 'pm'])
  })

  it('refuses to move the manager', () => {
    const { org } = seedOrg()
    expect(() => reassign(org, 'mgr', 'sa1')).toThrow(/manager is the root/)
  })

  it('refuses to move a member under its own downline (tier rule blocks it)', () => {
    const { org } = seedOrg()
    // sa1 → under a1 would be a cycle; a1 is a lower tier, so the rule rejects it
    expect(() => reassign(org, 'sa1', 'a1')).toThrow(/sub-agent can't sit under an agent/)
  })
})

describe('credit limits', () => {
  it('grants and updates a credit limit', () => {
    const { org } = seedOrg()
    setCreditLimit(org, 'p1', 25_000)
    expect(getMember(org, 'p1').account.creditLimit).toBe(25_000)
  })

  it('rejects a negative or fractional credit limit', () => {
    const { org } = seedOrg()
    expect(() => setCreditLimit(org, 'p1', -1)).toThrow(/≥ 0/)
    expect(() => setCreditLimit(org, 'p1', 1.5)).toThrow(/whole number/)
  })
})

describe('credit waterfall', () => {
  it('tracks allocated + available credit', () => {
    const { org } = seedOrg()
    // manager line 1,000,000; granted 500,000 (sa1) + 200,000 (a0) + 10,000 (pm)
    expect(allocatedCredit(org, 'mgr')).toBe(710_000)
    expect(availableCredit(org, 'mgr')).toBe(290_000)
    // sub-agent line 500,000; granted 200,000 (a1) + 10,000 (psa)
    expect(availableCredit(org, 'sa1')).toBe(290_000)
  })

  it("won't grant a new member more than the parent has left", () => {
    const { org } = seedOrg()
    // manager only has 290,000 left to hand down
    expect(() => addSubAgent(org, { name: 'too big', creditLimit: 400_000 })).toThrow(
      /exceeds .*available credit/,
    )
    // within the headroom is fine
    expect(() => addSubAgent(org, { name: 'ok', creditLimit: 200_000 })).not.toThrow()
  })

  it("won't raise a member's credit past the parent's headroom", () => {
    const { org } = seedOrg()
    // a1 currently 200,000; sub-agent has 290,000 spare → max a1 = 490,000
    expect(() => setCreditLimit(org, 'a1', 490_000)).not.toThrow()
    expect(() => setCreditLimit(org, 'a1', 500_000)).toThrow(/exceeds .*available credit/)
  })

  it("won't cut a member's credit below what they've already granted", () => {
    const { org } = seedOrg()
    // sa1 has granted 210,000 downstream; can't drop below that
    expect(() => setCreditLimit(org, 'sa1', 100_000)).toThrow(/already granted/)
    expect(() => setCreditLimit(org, 'sa1', 300_000)).not.toThrow()
  })

  it('blocks a move that the new parent has no headroom for', () => {
    const { org } = seedOrg()
    const sa2 = addSubAgent(org, { name: 'Sub Two', creditLimit: 50_000, id: 'sa2' })
    void sa2
    // a1 carries a 200,000 line; sa2 only has 50,000 headroom
    expect(() => reassign(org, 'a1', 'sa2')).toThrow(/headroom/)
  })
})

describe('weekly settlement', () => {
  it('statements each member at their book figure', () => {
    const { org } = seedOrg()
    getMember(org, 'p1').account.balance = -3_000
    getMember(org, 'psa').account.balance = 1_000
    getMember(org, 'pm').account.balance = -500

    const stmt = settlementStatement(org)
    const byId = Object.fromEntries(stmt.map((s) => [s.memberId, s.amount]))
    expect(byId['p1']).toBe(-3_000) // leaf settles its own figure
    expect(byId['sa1']).toBe(-3_000 + 1_000) // sub-agent's whole book
    expect(byId['mgr']).toBe(-3_000 + 1_000 - 500) // whole operation
  })

  it('rolls every figure up to the manager, then resets to zero', () => {
    const { org } = seedOrg()
    getMember(org, 'p1').account.balance = -3_000
    getMember(org, 'psa').account.balance = 1_000
    getMember(org, 'pm').account.balance = -500
    const total = bookFigure(org, 'mgr')

    const stmt = settleOrgWeek(org)
    expect(stmt.find((s) => s.memberId === 'mgr')!.amount).toBe(total)
    // every balance is zeroed for the new week
    for (const m of Object.values(org.members)) {
      expect(m.account.balance).toBe(0)
    }
  })

  it('refuses to settle while a wager is still pending', () => {
    const { org } = seedOrg()
    getMember(org, 'p1').account.pending = 500
    expect(() => settleOrgWeek(org)).toThrow(/still has .*pending/)
  })

  it('carryover records the statement but leaves every figure untouched', () => {
    const { org } = seedOrg()
    getMember(org, 'p1').account.balance = -3_000
    getMember(org, 'psa').account.balance = 1_000
    const total = bookFigure(org, 'mgr')

    const stmt = settleOrgWeek(org, { carryover: true })
    // the statement is the same snapshot…
    expect(stmt.find((s) => s.memberId === 'mgr')!.amount).toBe(total)
    // …but nothing was rolled up or zeroed — figures carry forward
    expect(getMember(org, 'p1').account.balance).toBe(-3_000)
    expect(getMember(org, 'psa').account.balance).toBe(1_000)
  })
})

describe('per-head min bet + max payout setters', () => {
  it('sets and clears a player min bet (players only)', () => {
    const { org } = seedOrg()
    setMinWager(org, 'p1', 500)
    expect(getMember(org, 'p1').account.minWager).toBe(500)
    setMinWager(org, 'p1', null)
    expect(getMember(org, 'p1').account.minWager).toBeUndefined()
    expect(() => setMinWager(org, 'a1', 500)).toThrow(/only players/)
    expect(() => setMinWager(org, 'p1', 0)).toThrow(/≥ 1/)
  })

  it('sets and clears a player max payout (players only)', () => {
    const { org } = seedOrg()
    setMaxPayout(org, 'p1', 250_000)
    expect(getMember(org, 'p1').account.maxPayout).toBe(250_000)
    setMaxPayout(org, 'p1', null)
    expect(getMember(org, 'p1').account.maxPayout).toBeUndefined()
    expect(() => setMaxPayout(org, 'a1', 1000)).toThrow(/only players/)
    expect(() => setMaxPayout(org, 'p1', 0)).toThrow(/≥ 1/)
  })
})

describe('creditUtilization', () => {
  it('rises as a member goes down, caps at 1, and is 0 when even/up or unlimited', () => {
    const { org } = seedOrg()
    const p1 = getMember(org, 'p1') // creditLimit 10,000
    expect(creditUtilization(p1)).toBe(0) // fresh: even

    p1.account.balance = -5_000
    expect(creditUtilization(p1)).toBeCloseTo(0.5, 10) // half the line eaten

    p1.account.balance = -10_000
    expect(creditUtilization(p1)).toBe(1) // maxed out

    p1.account.balance = -20_000 // can't exceed the limit in the gauge
    expect(creditUtilization(p1)).toBe(1)

    p1.account.balance = 4_000 // up on the week → no credit consumed
    expect(creditUtilization(p1)).toBe(0)

    // pending (live at-risk) also consumes the line
    p1.account.balance = 0
    p1.account.pending = 2_500
    expect(creditUtilization(p1)).toBeCloseTo(0.25, 10)

    // a zero credit line never divides — always 0
    const noLine = getMember(org, 'mgr')
    noLine.account.creditLimit = 0
    noLine.account.balance = -1_000
    expect(creditUtilization(noLine)).toBe(0)
  })
})
