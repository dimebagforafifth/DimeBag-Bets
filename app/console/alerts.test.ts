import { describe, it, expect } from 'vitest'
import type { Member, Org, Role } from '../../features/org/index.js'
import type { BetRow } from '../ledger-stats.js'
import { buildOperatorAlerts } from './alerts.js'

const money = (c: number): string => `$${(c / 100).toFixed(0)}`
const NOW = 1_000_000_000_000

function member(
  id: string,
  role: Role,
  pending: number,
  balance = 0,
  creditLimit = 100_000,
): Member {
  return {
    id,
    role,
    name: id.toUpperCase(),
    parentId: role === 'manager' ? null : 'mgr',
    account: { id, creditLimit, balance, pending },
    active: true,
    profile: {},
  }
}

function org(...members: Member[]): Org {
  return { managerId: 'mgr', members: Object.fromEntries(members.map((m) => [m.id, m])) }
}

const row = (over: Partial<BetRow>): BetRow => ({
  id: 1,
  accountId: 'p1',
  gameKey: 'mines',
  game: 'Mines',
  stake: 1000,
  multiplier: 2,
  profit: 0,
  outcome: 'win',
  time: NOW,
  ...over,
})

describe('buildOperatorAlerts', () => {
  const base = {
    thresholds: { creditUtil: 0.99, exposureCap: 200_000 },
    money,
    now: NOW,
  }

  it('flags exposure over the cap', () => {
    const alerts = buildOperatorAlerts({
      ...base,
      org: org(member('mgr', 'manager', 0)),
      rows: [],
      exposure: 300_000,
    })
    expect(alerts.some((a) => a.severity === 'warn' && /exposure/i.test(a.message))).toBe(true)
  })

  it('flags a big recent win and a large pending position', () => {
    const o = org(member('mgr', 'manager', 0), member('p1', 'player', 60_000))
    const alerts = buildOperatorAlerts({
      ...base,
      org: o,
      rows: [row({ profit: 30_000, time: NOW })],
      exposure: 0,
    })
    expect(alerts.some((a) => /won \$300 on Mines/.test(a.message))).toBe(true)
    expect(alerts.some((a) => /P1 has \$600 at risk/.test(a.message))).toBe(true)
  })

  it('ignores stale wins and small positions', () => {
    const o = org(member('mgr', 'manager', 0), member('p1', 'player', 1_000))
    const alerts = buildOperatorAlerts({
      ...base,
      org: o,
      rows: [row({ profit: 30_000, time: NOW - 2 * 86_400_000 })], // 2 days old
      exposure: 0,
    })
    expect(alerts).toHaveLength(0)
  })
})
