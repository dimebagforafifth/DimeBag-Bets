/** The rewards hub mechanics — all REAL: rakeback accrues from wagering + claims into the
 *  balance, the daily bonus runs a 24h cooldown + streak, the warm-up unlocks at its wager
 *  threshold, free spins decrement + pay, and the store enforces affordability. Plus the
 *  comp engine + economy ledger + the credits-only invariant. */
import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_TIERS, tierForStatus, tierProgressFor } from './data.js'
import {
  getPlayerRewards,
  recordWager,
  settleWager,
  claimRakeback,
  dailyStatus,
  claimDaily,
  playFreeSpin,
  redeemStoreItem,
  activeBoost,
  applyProfitBoost,
  __resetRewardsPlayers,
} from './players.js'
import {
  getRewardsConfig,
  updateRewardsConfig,
  resetRewardsConfig,
  recordIssuance,
  canIssue,
  totalIssued,
  weekIssued,
} from './economy.js'
import { canComp, issueComp, compAllowanceLeft, agentCompUsed, __resetIssuance } from './comp.js'
import { getBook } from '../app/book-store.js'
import { adjustFigure } from '../app/manager-actions.js'
import { setAgentTile, __resetAllAgentPermissions } from '../app/agent-permissions.js'

const NOW = 1_750_000_000_000
const HOUR = 3_600_000
const DAY = 86_400_000

const balance = (id: string) => getBook().members[id].account.balance
const setBalance = (id: string, cents: number) => {
  const delta = cents - balance(id)
  if (delta !== 0) adjustFigure(id, delta, 'test setup', 'test')
}

beforeEach(() => {
  __resetRewardsPlayers()
  resetRewardsConfig()
  __resetIssuance()
  __resetAllAgentPermissions()
})

describe('rank ladder (credits wagered)', () => {
  it('derives the rank from credits wagered and reports progress', () => {
    expect(tierForStatus(DEFAULT_TIERS, 0).id).toBe('rookie')
    expect(tierForStatus(DEFAULT_TIERS, 68_400).id).toBe('gold') // 50k..250k
    const prog = tierProgressFor(DEFAULT_TIERS, 68_400)
    expect(prog.tier.id).toBe('gold')
    expect(prog.next?.id).toBe('platinum')
    expect(prog.pct).toBeGreaterThan(0)
    expect(prog.pct).toBeLessThan(1)
  })
})

describe('rakeback — accrues from real wagering, claims into the balance', () => {
  it('accrues at the config rate and grows lifetime wagered', () => {
    const rate = getRewardsConfig().loyalty.rakebackRate // 0.05
    const before = getPlayerRewards('p-marco')
    recordWager('p-marco', 100_000, NOW) // wager $1,000 (cents)
    const after = getPlayerRewards('p-marco')
    expect(after.wagered).toBe(before.wagered + 100_000)
    expect(after.rakebackAccrued).toBe(before.rakebackAccrued + Math.round(100_000 * rate)) // +5,000
  })

  it('claims the accrued rakeback into the real balance and zeroes it', () => {
    recordWager('p-marco', 100_000, NOW)
    const accrued = getPlayerRewards('p-marco').rakebackAccrued
    expect(accrued).toBeGreaterThan(0)
    const before = balance('p-marco')
    const moved = claimRakeback('p-marco', NOW)
    expect(moved).toBe(accrued)
    expect(balance('p-marco')).toBe(before + accrued)
    expect(getPlayerRewards('p-marco').rakebackAccrued).toBe(0)
    expect(claimRakeback('p-marco', NOW)).toBe(0) // nothing left
  })
})

describe('daily bonus — real 24h cooldown + streak', () => {
  it('claims, locks for 24h, then resets; streak climbs on consecutive days and resets on a miss', () => {
    const l = getRewardsConfig().loyalty
    // first claim → streak 1, amount = base + 1×step
    expect(dailyStatus('p-priya', NOW).claimable).toBe(true)
    const before = balance('p-priya')
    const r1 = claimDaily('p-priya', NOW)
    expect(r1).toMatchObject({ ok: true, streak: 1 })
    expect(r1.amountCents).toBe((l.dailyBase + 1 * l.dailyStreakStep) * 100)
    expect(balance('p-priya')).toBe(before + r1.amountCents) // real credits

    // locked for 24h
    expect(claimDaily('p-priya', NOW + 23 * HOUR).ok).toBe(false)
    const st = dailyStatus('p-priya', NOW + HOUR)
    expect(st.claimable).toBe(false)
    expect(st.msLeft).toBeGreaterThan(0)

    // next day → consecutive → streak 2
    const r2 = claimDaily('p-priya', NOW + DAY)
    expect(r2).toMatchObject({ ok: true, streak: 2 })

    // skip a day (≥48h after the last claim) → streak resets to 1
    const r3 = claimDaily('p-priya', NOW + DAY + 48 * HOUR)
    expect(r3).toMatchObject({ ok: true, streak: 1 })
  })
})

describe('warm-up — unlocks at its wager threshold', () => {
  it('advances with wagering and unlocks the locked credits at the threshold', () => {
    // p-tariq seed: locked 200_000, wagered 25_000, required 600_000
    const need = 600_000 - 25_000
    const r0 = recordWager('p-tariq', need - 1, NOW) // one short
    expect(r0.unlockedCents).toBe(0)
    expect(getPlayerRewards('p-tariq').warmup).not.toBeNull()

    const r1 = recordWager('p-tariq', 1, NOW) // crosses the threshold
    expect(r1.unlockedCents).toBe(200_000)
    expect(getPlayerRewards('p-tariq').warmup).toBeNull()
  })

  it('settleWager credits the unlocked warm-up to the real balance', () => {
    const before = balance('p-tariq')
    const out = settleWager('p-tariq', 600_000, NOW) // 25_000 + 600_000 ≥ 600_000
    expect(out.unlockedCents).toBe(200_000)
    expect(balance('p-tariq')).toBe(before + 200_000)
    expect(getPlayerRewards('p-tariq').warmup).toBeNull()
  })
})

describe('free spins — decrement + pay real credits, run out', () => {
  it('pays in the config range, decrements the count, and stops at zero', () => {
    const l = getRewardsConfig().loyalty
    const spins = getPlayerRewards('p-marco').freeSpins // 3
    expect(spins).toBe(3)

    const before = balance('p-marco')
    const low = playFreeSpin('p-marco', NOW, 0) // floor payout
    expect(low.payoutCents).toBe(l.spinMin * 100)
    expect(low.spinsLeft).toBe(2)
    expect(balance('p-marco')).toBe(before + l.spinMin * 100)

    const high = playFreeSpin('p-marco', NOW, 0.999999) // ceiling payout
    expect(high.payoutCents).toBe(l.spinMax * 100)
    expect(high.spinsLeft).toBe(1)

    playFreeSpin('p-marco', NOW, 0.5) // last spin
    const empty = playFreeSpin('p-marco', NOW, 0.5)
    expect(empty.ok).toBe(false)
    expect(getPlayerRewards('p-marco').freeSpins).toBe(0)
  })
})

describe('store — affordability is enforced; redeeming moves credits + grants the item', () => {
  it('rejects what you can’t afford and grants what you can', () => {
    const item = getRewardsConfig().loyalty.store.find((i) => i.id === 'spins-5')!
    const costCents = item.cost * 100

    setBalance('p-priya', costCents - 1) // one short
    expect(redeemStoreItem('p-priya', 'spins-5', NOW)).toMatchObject({ ok: false })

    setBalance('p-priya', costCents + 50_000)
    const spinsBefore = getPlayerRewards('p-priya').freeSpins
    const before = balance('p-priya')
    expect(redeemStoreItem('p-priya', 'spins-5', NOW)).toEqual({ ok: true })
    expect(balance('p-priya')).toBe(before - costCents) // spent
    expect(getPlayerRewards('p-priya').freeSpins).toBe(spinsBefore + item.amount) // granted
  })

  it('blocks re-buying a one-time item', () => {
    setBalance('p-dana', 10_000_000)
    // p-dana already owns flair-gold in the seed
    expect(redeemStoreItem('p-dana', 'flair-gold', NOW)).toMatchObject({ ok: false, reason: 'Already owned.' })
  })
})

describe('profit boost — adds % to winning profit, capped at the stake limit', () => {
  it('credits boostPct% of the profit on up to maxStake of stake', () => {
    const boost = activeBoost()! // seeded: 25% up to $100
    expect(boost).toMatchObject({ boostPct: 25, maxStake: 100 })

    // $50 stake, $50 profit (even money) — fully under the $100 cap → +25% = $12.50
    const before = balance('p-marco')
    const extra = applyProfitBoost('p-marco', 5_000, 5_000, NOW)
    expect(extra).toBe(1_250)
    expect(balance('p-marco')).toBe(before + 1_250)
  })

  it('only boosts the profit earned on the first $cap of stake', () => {
    // $200 stake, $200 profit, $100 cap → boost applies to half → +25% of $100 = $25
    const extra = applyProfitBoost('p-lena', 20_000, 20_000, NOW)
    expect(extra).toBe(2_500)
  })

  it('does nothing when promos are off or there is no active boost', () => {
    updateRewardsConfig({ loyalty: { ...getRewardsConfig().loyalty, features: { ...getRewardsConfig().loyalty.features, promos: false } } })
    expect(activeBoost()).toBeNull()
    expect(applyProfitBoost('p-marco', 5_000, 5_000, NOW)).toBe(0)
  })
})

describe('comp — role / permission / downline / allowance gating', () => {
  it('a manager can comp anyone; a player never can', () => {
    expect(canComp('mgr', 'manager', 'p-tariq').ok).toBe(true)
    expect(canComp('p-marco', 'player', 'p-lena').ok).toBe(false)
  })

  it('an agent needs the granted permission AND a downline target, within allowance', () => {
    expect(canComp('a-e', 'agent', 'p-marco').ok).toBe(false)
    setAgentTile('a-e', 'rewards-comp', true)
    expect(canComp('a-e', 'agent', 'p-marco').ok).toBe(true)
    expect(canComp('a-e', 'agent', 'p-tariq').ok).toBe(false) // not in a-e's downline

    const cap = getRewardsConfig().economy.agentWeeklyCompAllowance
    expect(compAllowanceLeft('a-e', 'agent', NOW)).toBe(cap)
    expect(issueComp({ actorMemberId: 'a-e', actorRole: 'agent', targetPlayerId: 'p-marco', kind: 'balance', amount: cap - 1_000, reason: 'loyalty', now: NOW }).ok).toBe(true)
    expect(agentCompUsed('a-e', NOW)).toBe(cap - 1_000)
    expect(issueComp({ actorMemberId: 'a-e', actorRole: 'agent', targetPlayerId: 'p-marco', kind: 'balance', amount: 5_000, reason: 'more', now: NOW }).error).toMatch(/allowance/i)
  })
})

describe('economy issuance ledger + caps', () => {
  it('canIssue enforces the weekly budget AND the total cap', () => {
    const base = totalIssued()
    updateRewardsConfig({ economy: { ...getRewardsConfig().economy, totalIssuanceCap: base + 1_000_000, weeklyBudget: weekIssued(NOW) + 600 } })
    expect(canIssue(500, NOW).ok).toBe(true)
    recordIssuance('mission', 500, NOW)
    expect(canIssue(200, NOW).reason).toMatch(/budget/i)
    updateRewardsConfig({ economy: { ...getRewardsConfig().economy, weeklyBudget: 0, totalIssuanceCap: totalIssued() + 100 } })
    expect(canIssue(200, NOW).reason).toMatch(/cap/i)
  })
})

describe('credits & status only — no coins / cash anywhere in config', () => {
  it('the config surfaces no "coins" / "$" / cash-value / withdrawal path', () => {
    const blob = JSON.stringify(getRewardsConfig())
    expect(blob).not.toMatch(/coin|\$|cash[- ]?out|withdraw|real[- ]?money|cash value/i)
  })
})
