import { describe, expect, it } from 'vitest'
import { createOrg, directReports, membersByRole, type Org } from '../org/index.js'
import { buildTree, type RowInput } from './tree.js'
import type { MappedPlayer } from './types.js'

const mp = (name: string, agentPath: string[], credit = 1000, bal = 0): MappedPlayer => ({
  name,
  agentPath,
  creditLimitCents: credit,
  startingBalanceCents: bal,
  profile: {},
})

const input = (rowId: string, m: MappedPlayer): RowInput => ({ rowId, mapped: m })

function freshOrg(creditLimit = 100_000_000): Org {
  return createOrg({ name: 'Book', creditLimit, id: 'mgr' })
}

const playerNames = (org: Org) =>
  membersByRole(org, 'player')
    .map((p) => p.name)
    .sort()

describe('buildTree — agent tree reconstruction + player creation', () => {
  it('creates a one-level agent under the manager and the player under it', () => {
    const org = freshOrg()
    const res = buildTree(org, [input('r1', mp('Marco', ['East'], 2000))])
    expect(res.outcomes[0].result).toBe('created')
    expect(res.createdAgentCount).toBe(1)
    const agent = membersByRole(org, 'agent').find((a) => a.name === 'East')!
    expect(agent.parentId).toBe('mgr')
    expect(directReports(org, agent.id).map((m) => m.name)).toEqual(['Marco'])
  })

  it('creates a sub-agent → agent chain for a two-level path', () => {
    const org = freshOrg()
    buildTree(org, [input('r1', mp('Marco', ['North', 'East'], 2000))])
    const sub = membersByRole(org, 'subagent').find((s) => s.name === 'North')!
    const agent = membersByRole(org, 'agent').find((a) => a.name === 'East')!
    expect(sub.parentId).toBe('mgr')
    expect(agent.parentId).toBe(sub.id)
  })

  it('attaches a house-direct player (no agent path) under the manager', () => {
    const org = freshOrg()
    const res = buildTree(org, [input('r1', mp('Solo', [], 500))])
    expect(res.outcomes[0].result).toBe('created')
    expect(res.createdAgentCount).toBe(0)
    expect(directReports(org, 'mgr').map((m) => m.name)).toContain('Solo')
  })

  it('shares one agent across rows (created once) and rolls credit up', () => {
    const org = freshOrg()
    const res = buildTree(org, [
      input('r1', mp('Marco', ['East'], 2000)),
      input('r2', mp('Lena', ['East'], 1500)),
    ])
    expect(res.createdAgentCount).toBe(1)
    const agent = membersByRole(org, 'agent').find((a) => a.name === 'East')!
    expect(agent.account.creditLimit).toBe(3500) // 2000 + 1500 roll-up
    expect(
      directReports(org, agent.id)
        .map((m) => m.name)
        .sort(),
    ).toEqual(['Lena', 'Marco'])
  })

  it('skips a duplicate within the batch and against existing players', () => {
    const org = freshOrg()
    const first = buildTree(org, [input('r1', mp('Marco', ['East'], 2000))])
    expect(first.outcomes[0].result).toBe('created')
    // same name under the same agent, in a later run → skipped (idempotent re-import)
    const again = buildTree(org, [input('r2', mp('Marco', ['East'], 2000))])
    expect(again.outcomes[0].result).toBe('skipped')
    expect(playerNames(org)).toEqual(['Marco']) // not duplicated

    // duplicate WITHIN one batch
    const dupBatch = buildTree(freshOrg(), [
      input('a', mp('Sam', ['West'])),
      input('b', mp('Sam', ['West'])),
    ])
    expect(dupBatch.outcomes.map((o) => o.result)).toEqual(['created', 'skipped'])
  })

  it('errors a row with no name and a path that is too deep', () => {
    const org = freshOrg()
    const res = buildTree(org, [
      input('r1', mp('', ['East'])),
      input('r2', mp('Sam', ['A', 'B', 'C'])),
    ])
    expect(res.outcomes[0]).toMatchObject({ result: 'error', errorReason: 'missing player name' })
    expect(res.outcomes[1].result).toBe('error')
    expect(res.outcomes[1].errorReason).toMatch(/too deep/)
    expect(membersByRole(org, 'player')).toHaveLength(0)
  })

  it('errors rows whose agent does not fit the manager’s credit (waterfall), without aborting', () => {
    const org = freshOrg(1000) // manager can only grant 1000 total
    const res = buildTree(org, [
      input('r1', mp('A', ['Big'], 5000)), // agent 'Big' needs 5000 > 1000 → cannot create
      input('r2', mp('B', [], 200)), // house-direct fits under the manager
    ])
    const byRow = new Map(res.outcomes.map((o) => [o.rowId, o]))
    expect(byRow.get('r1')!.result).toBe('error')
    expect(byRow.get('r2')!.result).toBe('created') // the build continued past the bad row
    expect(membersByRole(org, 'player').map((p) => p.name)).toEqual(['B'])
  })

  it('reuses an existing agent by name rather than creating a second', () => {
    const org = freshOrg()
    buildTree(org, [input('r1', mp('Marco', ['East'], 2000))])
    const before = membersByRole(org, 'agent').length
    buildTree(org, [input('r2', mp('Lena', ['east'], 1000))]) // case-insensitive match
    expect(membersByRole(org, 'agent').length).toBe(before) // no new agent
    const agent = membersByRole(org, 'agent').find((a) => a.name === 'East')!
    expect(
      directReports(org, agent.id)
        .map((m) => m.name)
        .sort(),
    ).toEqual(['Lena', 'Marco'])
  })

  it('tops up an existing agent so newly-imported players fit (within the manager’s headroom)', () => {
    const org = freshOrg()
    buildTree(org, [input('r1', mp('Marco', ['East'], 2000))]) // East sized to exactly 2000
    const east = membersByRole(org, 'agent').find((a) => a.name === 'East')!
    expect(east.account.creditLimit).toBe(2000)
    buildTree(org, [input('r2', mp('Lena', ['East'], 1500))]) // needs +1500 headroom
    expect(membersByRole(org, 'agent').find((a) => a.name === 'East')!.account.creditLimit).toBe(
      3500,
    )
    expect(
      directReports(org, east.id)
        .map((m) => m.name)
        .sort(),
    ).toEqual(['Lena', 'Marco'])
  })

  it('errors a player whose line can’t fit when the agent can’t be grown (manager out of headroom)', () => {
    const org = freshOrg(2000) // manager can grant exactly 2000
    buildTree(org, [input('r1', mp('Marco', ['East'], 2000))]) // consumes all of it
    const res = buildTree(org, [input('r2', mp('Lena', ['East'], 1500))]) // East can't grow
    expect(res.outcomes[0].result).toBe('error')
    expect(membersByRole(org, 'player').map((p) => p.name)).toEqual(['Marco']) // Lena not added
  })

  it('a skipped duplicate does NOT inflate the agent credit (sized to the real roster)', () => {
    const org = freshOrg()
    const res = buildTree(org, [
      input('r1', mp('Marco', ['East'], 2000)),
      input('r2', mp('Marco', ['East'], 2000)), // dup → skipped, must not add to East's line
    ])
    expect(res.outcomes.map((o) => o.result)).toEqual(['created', 'skipped'])
    const east = membersByRole(org, 'agent').find((a) => a.name === 'East')!
    expect(east.account.creditLimit).toBe(2000) // not 4000
  })

  it('a duplicate does not cascade-fail a distinct player by over-crediting (waterfall precision)', () => {
    // Manager can grant exactly 3500. East(2000) + West(1500) = 3500 fits — but only if the
    // duplicate Marco doesn't inflate East to 4000 and exhaust the manager.
    const org = freshOrg(3500)
    const res = buildTree(org, [
      input('r1', mp('Marco', ['East'], 2000)),
      input('r2', mp('Marco', ['East'], 2000)), // dup → skipped
      input('r3', mp('Lena', ['West'], 1500)), // distinct player under a different agent
    ])
    const byRow = new Map(res.outcomes.map((o) => [o.rowId, o.result]))
    expect(byRow.get('r1')).toBe('created')
    expect(byRow.get('r2')).toBe('skipped')
    expect(byRow.get('r3')).toBe('created') // would FAIL if East were over-credited to 4000
    expect(playerNames(org)).toEqual(['Lena', 'Marco'])
  })

  it('a pre-existing (skipped) player does not inflate the existing-agent top-up', () => {
    const org = freshOrg()
    buildTree(org, [input('r1', mp('Marco', ['East'], 2000))]) // East sized 2000, full
    const res = buildTree(org, [
      input('r2', mp('Marco', ['East'], 2000)), // already exists → skipped
      input('r3', mp('Lena', ['East'], 1500)), // genuinely new → needs +1500
    ])
    expect(res.outcomes.map((o) => o.result)).toEqual(['skipped', 'created'])
    const east = membersByRole(org, 'agent').find((a) => a.name === 'East')!
    expect(east.account.creditLimit).toBe(3500) // 2000 + 1500 only (not + the skipped 2000)
  })

  it('returns created players with their opening figures for the balance pass', () => {
    const org = freshOrg()
    const res = buildTree(org, [input('r1', mp('Marco', ['East'], 2000, -45000))])
    expect(res.createdPlayers).toHaveLength(1)
    expect(res.createdPlayers[0]).toMatchObject({ rowId: 'r1', startingBalanceCents: -45000 })
    expect(res.createdPlayers[0].playerId).toBe(res.outcomes[0].playerId)
  })
})
