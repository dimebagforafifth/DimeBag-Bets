import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_TIERS, tierForStatus, tierProgressFor } from './data.js'
import {
  getPlayerRewards,
  accrueFromWager,
  claimCashback,
  grantLockedBonus,
  spendSpendable,
  __resetRewardsPlayers,
} from './players.js'
import { getRewardsConfig, visiblePromos, setProgramEnabled, resetRewardsConfig } from './economy.js'
import {
  canComp,
  issueComp,
  compAllowanceLeft,
  agentCompUsed,
  __resetIssuance,
} from './comp.js'
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
    expect(r.unlockedCoins).toBe(0)
    const mid = getPlayerRewards('pX')
    expect(mid.status).toBe(400) // status = stake
    expect(mid.cashbackPending).toBe(Math.round(400 * getRewardsConfig().economy.cashbackRate))
    expect(mid.locked[0].wagered).toBe(400)

    r = accrueFromWager('pX', 700) // total 1,100 ≥ 1,000 → unlocks
    expect(r.unlockedCoins).toBe(1_000)
    expect(getPlayerRewards('pX').locked).toHaveLength(0)
  })

  it('claims cashback into the spendable balance', () => {
    accrueFromWager('pY', 10_000) // cashback = 50 at 0.5%
    const pending = getPlayerRewards('pY').cashbackPending
    expect(pending).toBeGreaterThan(0)
    const moved = claimCashback('pY')
    expect(moved).toBe(pending)
    expect(getPlayerRewards('pY').spendable).toBe(pending)
    expect(getPlayerRewards('pY').cashbackPending).toBe(0)
  })

  it('a 0-playthrough bonus unlocks instantly (no lock created)', () => {
    const out = grantLockedBonus('pZ', 500, 0, 'Instant')
    expect(out.instantCoins).toBe(500)
    expect(getPlayerRewards('pZ').locked).toHaveLength(0)
  })

  it('store redemption spends from spendable, never the regular balance', () => {
    accrueFromWager('pS', 100_000)
    claimCashback('pS')
    const bal = getPlayerRewards('pS').spendable
    expect(spendSpendable('pS', bal + 1)).toBe(false) // can't overspend
    expect(spendSpendable('pS', 100)).toBe(true)
    expect(getPlayerRewards('pS').spendable).toBe(bal - 100)
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

    const ok = issueComp({ actorMemberId: 'a-e', actorRole: 'agent', targetPlayerId: 'p-marco', kind: 'coins', amount: cap - 1_000, reason: 'loyalty', now })
    expect(ok.ok).toBe(true)
    expect(agentCompUsed('a-e', now)).toBe(cap - 1_000)

    const over = issueComp({ actorMemberId: 'a-e', actorRole: 'agent', targetPlayerId: 'p-marco', kind: 'coins', amount: 5_000, reason: 'more', now })
    expect(over.ok).toBe(false)
    expect(over.error).toMatch(/allowance/i)
  })

  it('a coins comp credits the player’s spendable + records the comp + counts issuance', () => {
    const now = 1_750_000_000_000
    const before = getPlayerRewards('p-dana').spendable
    const res = issueComp({ actorMemberId: 'mgr', actorRole: 'manager', targetPlayerId: 'p-dana', kind: 'coins', amount: 2_500, reason: 'VIP care', now })
    expect(res.ok).toBe(true)
    expect(getPlayerRewards('p-dana').spendable).toBe(before + 2_500)
    expect(getPlayerRewards('p-dana').compHistory[0]).toMatchObject({ amount: 2_500, kind: 'coins', byName: 'Your Book' })
  })
})

describe('coins-only invariant', () => {
  it('no rewards config surfaces a "$" / cash-value / withdrawal path (cashback is coins, allowed)', () => {
    const blob = JSON.stringify(getRewardsConfig())
    expect(blob).not.toMatch(/\$|cash[- ]?out|withdraw|real[- ]?money|cash value/i)
  })
})
