import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_TIERS, tierForStatus, tierProgressFor } from './data.js'
import {
  getPlayerRewards,
  accrueFromWager,
  claimCashback,
  grantLockedBonus,
  __resetRewardsPlayers,
} from './players.js'
import {
  getRewardsConfig,
  updateRewardsConfig,
  visiblePromos,
  setProgramEnabled,
  resetRewardsConfig,
  recordIssuance,
  canIssue,
  totalIssued,
  weekIssued,
  issuedByProgram,
} from './economy.js'
import {
  canComp,
  issueComp,
  compAllowanceLeft,
  agentCompUsed,
  __resetIssuance,
} from './comp.js'
import { getBook } from '../app/book-store.js'
import { setAgentTile, __resetAllAgentPermissions } from '../app/agent-permissions.js'

beforeEach(() => {
  __resetRewardsPlayers()
  resetRewardsConfig()
  __resetIssuance()
  __resetAllAgentPermissions()
})

describe('tier ladder (status-driven)', () => {
  it('derives the tier from a status score and reports progress', () => {
    expect(tierForStatus(DEFAULT_TIERS, 0).id).toBe('rookie')
    expect(tierForStatus(DEFAULT_TIERS, 68_400).id).toBe('gold') // 50k..250k
    const prog = tierProgressFor(DEFAULT_TIERS, 68_400)
    expect(prog.tier.id).toBe('gold')
    expect(prog.next?.id).toBe('platinum')
    expect(prog.pct).toBeGreaterThan(0)
    expect(prog.pct).toBeLessThan(1)
  })
})

describe('play accrual', () => {
  it('status climbs by stake, cashback accrues, and a locked bonus unlocks at playthrough', () => {
    __resetRewardsPlayers()
    grantLockedBonus('pX', 1_000, 1, 'Test promo', 'lb-x') // needs 1,000 wagered
    const before = getPlayerRewards('pX')
    expect(before.status).toBe(0)

    let r = accrueFromWager('pX', 400)
    expect(r.unlocked).toBe(0)
    const mid = getPlayerRewards('pX')
    expect(mid.status).toBe(400) // status = stake
    expect(mid.cashbackPending).toBe(Math.round(400 * getRewardsConfig().economy.cashbackRate))
    expect(mid.locked[0].wagered).toBe(400)

    r = accrueFromWager('pX', 700) // total 1,100 ≥ 1,000 → unlocks
    expect(r.unlocked).toBe(1_000)
    expect(getPlayerRewards('pX').locked).toHaveLength(0)
  })

  it('claims cashback (returned for the host to credit to the balance, never a wallet)', () => {
    accrueFromWager('pY', 10_000) // cashback = 50 at 0.5%
    const pending = getPlayerRewards('pY').cashbackPending
    expect(pending).toBeGreaterThan(0)
    const moved = claimCashback('pY')
    expect(moved).toBe(pending) // amount handed back to credit the figure
    expect(getPlayerRewards('pY').cashbackPending).toBe(0)
  })

  it('a 0-playthrough bonus unlocks instantly (no lock created)', () => {
    const out = grantLockedBonus('pZ', 500, 0, 'Instant')
    expect(out.instant).toBe(500)
    expect(getPlayerRewards('pZ').locked).toHaveLength(0)
  })
})

describe('player-facing config (enabled programs only)', () => {
  it('hides promos when the program is turned off', () => {
    const now = 1_750_000_000_000
    expect(visiblePromos(now).length).toBeGreaterThan(0)
    setProgramEnabled('promos', false)
    expect(visiblePromos(now)).toEqual([])
  })
})

describe('comp — role / permission / downline / allowance gating', () => {
  it('a manager can comp anyone', () => {
    expect(canComp('mgr', 'manager', 'p-tariq').ok).toBe(true)
  })

  it('a player can never comp', () => {
    expect(canComp('p-marco', 'player', 'p-lena').ok).toBe(false)
  })

  it('an agent needs the granted permission AND a downline target', () => {
    // no permission yet
    expect(canComp('a-e', 'agent', 'p-marco').ok).toBe(false)
    setAgentTile('a-e', 'rewards-comp', true)
    // p-marco is under East Desk (a-e); p-tariq is under West Desk (a-w)
    expect(canComp('a-e', 'agent', 'p-marco').ok).toBe(true)
    expect(canComp('a-e', 'agent', 'p-tariq').ok).toBe(false) // not in a-e's downline
  })

  it('enforces the agent weekly comp allowance', () => {
    setAgentTile('a-e', 'rewards-comp', true)
    const now = 1_750_000_000_000
    const cap = getRewardsConfig().economy.agentWeeklyCompAllowance
    expect(compAllowanceLeft('a-e', 'agent', now)).toBe(cap)

    const ok = issueComp({ actorMemberId: 'a-e', actorRole: 'agent', targetPlayerId: 'p-marco', kind: 'balance', amount: cap - 1_000, reason: 'loyalty', now })
    expect(ok.ok).toBe(true)
    expect(agentCompUsed('a-e', now)).toBe(cap - 1_000)

    const over = issueComp({ actorMemberId: 'a-e', actorRole: 'agent', targetPlayerId: 'p-marco', kind: 'balance', amount: 5_000, reason: 'more', now })
    expect(over.ok).toBe(false)
    expect(over.error).toMatch(/allowance/i)
  })

  it('a balance comp credits the player’s real figure + records the comp + counts issuance', () => {
    const now = 1_750_000_000_000
    const before = getBook().members['p-dana'].account.balance
    const res = issueComp({ actorMemberId: 'mgr', actorRole: 'manager', targetPlayerId: 'p-dana', kind: 'balance', amount: 2_500, reason: 'VIP care', now })
    expect(res.ok).toBe(true)
    // credited through core in cents (2,500 units → 250,000 cents)
    expect(getBook().members['p-dana'].account.balance).toBe(before + 250_000)
    expect(getPlayerRewards('p-dana').compHistory[0]).toMatchObject({ amount: 2_500, kind: 'balance', byName: 'Your Book' })
  })
})

describe('economy issuance ledger + caps', () => {
  const now = 1_750_000_000_000

  it('records issuance by program and by week (every grant path is tracked)', () => {
    recordIssuance('mission', 1_000, now)
    recordIssuance('cashback', 500, now)
    const after = issuedByProgram()
    expect(after.mission).toBeGreaterThanOrEqual(1_000)
    expect(after.cashback).toBeGreaterThanOrEqual(500)
    expect(weekIssued(now)).toBeGreaterThanOrEqual(1_500)
  })

  it('canIssue enforces the weekly budget AND the total cap', () => {
    const base = totalIssued()
    updateRewardsConfig({
      economy: { ...getRewardsConfig().economy, totalIssuanceCap: base + 1_000_000, weeklyBudget: weekIssued(now) + 600 },
    })
    expect(canIssue(500, now).ok).toBe(true)
    recordIssuance('mission', 500, now)
    // 500 already this week → another 200 would exceed the +600 weekly budget
    expect(canIssue(200, now).ok).toBe(false)
    expect(canIssue(200, now).reason).toMatch(/budget/i)

    // lift the weekly budget; now the TOTAL cap bites
    updateRewardsConfig({
      economy: { ...getRewardsConfig().economy, weeklyBudget: 0, totalIssuanceCap: totalIssued() + 100 },
    })
    expect(canIssue(200, now).ok).toBe(false)
    expect(canIssue(200, now).reason).toMatch(/cap/i)
  })
})

describe('balance & status only — no coins anywhere in config', () => {
  it('no rewards config surfaces "coins" / "$" / a cash-value / withdrawal path', () => {
    const blob = JSON.stringify(getRewardsConfig())
    expect(blob).not.toMatch(/coin|\$|cash[- ]?out|withdraw|real[- ]?money|cash value/i)
  })
})
