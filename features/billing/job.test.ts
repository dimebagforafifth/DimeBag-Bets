/** The weekly head-count job + the active-player definition. Covers: inactive excluded,
 *  active count matches downline activity, the settled-wager window, agent attribution. */

import { describe, expect, it } from 'vitest'
import { addAgent, addPlayer, createOrg, setActive, type Org } from '../org/index.js'
import { DEFAULT_BILLING_CONFIG } from './config.js'
import {
  runHeadCountJob,
  settledWagerCount,
  wasActiveInWeek,
  type ActivityReader,
  type ActivityRecord,
} from './job.js'

const WEEK_START = 1_000_000
const WEEK = 7 * 24 * 60 * 60 * 1000
const WEEK_END = WEEK_START + WEEK

/** Manager → Agent a-1 → {p1, p2}; p3 sits directly under the manager. */
function buildOrg(): Org {
  const org = createOrg({ name: 'Manager', id: 'mgr' })
  addAgent(org, 'mgr', { name: 'Agent A', id: 'a-1' })
  addPlayer(org, 'a-1', { name: 'P One', id: 'p1' })
  addPlayer(org, 'a-1', { name: 'P Two', id: 'p2' })
  addPlayer(org, 'mgr', { name: 'P Three', id: 'p3' })
  return org
}

const reader = (records: ActivityRecord[]): ActivityReader => ({ settledWagers: () => records })

const run = (org: Org, activity: ActivityReader, freeWeek = false) =>
  runHeadCountJob({
    org,
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    config: DEFAULT_BILLING_CONFIG,
    activity,
    freeWeek,
    tenantId: 'default',
    id: 'inv-1',
    now: WEEK_END,
  })

describe('wasActiveInWeek / settledWagerCount', () => {
  const recs: ActivityRecord[] = [
    { accountId: 'x', at: WEEK_START - 1, kind: 'resolve' }, // before window
    { accountId: 'x', at: WEEK_START + 10, kind: 'resolve' }, // in
    { accountId: 'x', at: WEEK_END, kind: 'resolve' }, // exactly week end — excluded (half-open)
    { accountId: 'x', at: WEEK_START + 20, kind: 'place' }, // placed, not settled
    { accountId: 'y', at: WEEK_START + 10, kind: 'resolve' }, // other account
  ]

  it('counts only this account’s SETTLED wagers inside [start, end)', () => {
    expect(settledWagerCount(recs, 'x', WEEK_START, WEEK_END)).toBe(1)
    expect(wasActiveInWeek(recs, 'x', WEEK_START, WEEK_END)).toBe(true)
    expect(wasActiveInWeek(recs, 'z', WEEK_START, WEEK_END)).toBe(false)
  })

  it('respects a higher minimum-settled-wagers threshold', () => {
    expect(
      wasActiveInWeek(recs, 'x', WEEK_START, WEEK_END, {
        kind: 'settled-wager',
        minSettledWagers: 2,
      }),
    ).toBe(false)
  })
})

describe('runHeadCountJob', () => {
  it('the active count matches downline settled-wager activity, and attributes the agent', () => {
    const org = buildOrg()
    const period = run(
      org,
      reader([
        { accountId: 'p1', at: WEEK_START + 100, kind: 'resolve' }, // active
        { accountId: 'p2', at: WEEK_START + 200, kind: 'place' }, // placed only → not active
        { accountId: 'p3', at: WEEK_END + 5, kind: 'resolve' }, // settled OUT of window → not active
      ]),
    )

    expect(period.snapshots).toHaveLength(3)
    expect(period.activeHeadCount).toBe(1)
    const by = Object.fromEntries(period.snapshots.map((s) => [s.playerId, s]))
    expect(by.p1.active).toBe(true)
    expect(by.p1.reason).toBe('settled-wager')
    expect(by.p1.agentId).toBe('a-1') // owning agent
    expect(by.p1.agentName).toBe('Agent A') // resolved name for the invoice view
    expect(by.p2.active).toBe(false)
    expect(by.p2.reason).toBe('no-activity')
    expect(by.p3.active).toBe(false)
    expect(by.p3.agentId).toBe(null) // directly under the manager
    expect(by.p3.agentName).toBe(null)
    expect(period.coverageComplete).toBe(true) // injected reader covers the window
    // 1 active head × $5
    expect(period.baseCents).toBe(500)
    expect(period.totalCents).toBe(500)
    expect(period.billedHeadCount).toBe(1)
  })

  it('excludes a suspended (inactive) member even when they have a settled wager', () => {
    const org = buildOrg()
    setActive(org, 'p1', false)
    const period = run(org, reader([{ accountId: 'p1', at: WEEK_START + 1, kind: 'resolve' }]))
    const p1 = period.snapshots.find((s) => s.playerId === 'p1')!
    expect(p1.active).toBe(false)
    expect(p1.reason).toBe('inactive')
    expect(period.activeHeadCount).toBe(0)
    expect(period.totalCents).toBe(0)
  })

  it('scopes to a sub-tree when given a rootId (per-agent billing)', () => {
    const org = buildOrg()
    const records = reader([
      { accountId: 'p1', at: WEEK_START + 1, kind: 'resolve' },
      { accountId: 'p3', at: WEEK_START + 1, kind: 'resolve' },
    ])
    const agentOnly = runHeadCountJob({
      org,
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      config: DEFAULT_BILLING_CONFIG,
      activity: records,
      rootId: 'a-1', // only p1 + p2 sit under agent a-1
      tenantId: 'default',
      id: 'inv-a',
      now: WEEK_END,
    })
    expect(agentOnly.snapshots.map((s) => s.playerId).sort()).toEqual(['p1', 'p2'])
    expect(agentOnly.activeHeadCount).toBe(1) // p3 is out of this scope
  })

  it('flags coverageComplete=false when the activity reader cannot guarantee the window', () => {
    const org = buildOrg()
    const partial: ActivityReader = {
      settledWagers: () => [{ accountId: 'p1', at: WEEK_START + 1, kind: 'resolve' }],
      coversWindow: () => false,
    }
    const period = runHeadCountJob({
      org,
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      config: DEFAULT_BILLING_CONFIG,
      activity: partial,
      tenantId: 'default',
      id: 'inv-x',
      now: WEEK_END,
    })
    expect(period.coverageComplete).toBe(false)
    expect(period.activeHeadCount).toBe(1) // still counted what it could see
  })

  it('a free week waives the run to $0 even with active heads', () => {
    const org = buildOrg()
    const period = run(
      org,
      reader([{ accountId: 'p1', at: WEEK_START + 1, kind: 'resolve' }]),
      true,
    )
    expect(period.activeHeadCount).toBe(1) // the count is still reported…
    expect(period.billedHeadCount).toBe(0) // …but nobody is charged
    expect(period.totalCents).toBe(0)
    expect(period.status).toBe('waived')
  })
})
