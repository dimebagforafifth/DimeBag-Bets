import { describe, expect, it } from 'vitest'
import { adjustBalance } from '../../core/index.js'
import { createOrg, getMember, membersByRole } from '../org/index.js'
import { commitBatch, type CommitDeps } from './commit.js'
import { DEFAULT_MAPPING_OPTIONS, type ImportBatch, type ImportRow } from './types.js'

/** A commit harness over a local org — exercises the real money path without the global book. */
function harness(creditLimit = 100_000_000) {
  const org = createOrg({ name: 'Book', creditLimit, id: 'mgr' })
  const figures: { id: string; delta: number }[] = []
  const summaries: string[] = []
  const deps: CommitDeps = {
    getBook: () => org,
    mutateBook: (fn) => fn(org),
    adjustFigure: (id, delta) => {
      figures.push({ id, delta })
      adjustBalance(getMember(org, id).account, delta) // the audited core primitive
    },
    recordSummary: (detail) => summaries.push(detail),
  }
  return { org, deps, figures, summaries }
}

const HEADERS = ['Player', 'Agent', 'Credit', 'Bal']
const COLUMN_MAP = { name: 'Player', agent: 'Agent', creditLimit: 'Credit', startingBalance: 'Bal' }

function batch(rows: ImportRow[]): ImportBatch {
  return {
    id: 'b1',
    tenantId: 'default',
    sourceLabel: 'Acme export',
    status: 'validated',
    rowCount: rows.length,
    createdCount: 0,
    skippedCount: 0,
    errorCount: 0,
    createdBy: 'op',
    createdAt: 0,
    headers: HEADERS,
    columnMap: COLUMN_MAP,
    options: DEFAULT_MAPPING_OPTIONS,
  }
}
const row = (i: number, raw: Record<string, string>): ImportRow => ({
  id: `b1-r${i}`,
  batchId: 'b1',
  raw,
  mapped: null,
  result: 'pending',
})

describe('commitBatch — creates members + agent tree + figures through the audited core path', () => {
  it('creates players, reconstructs agents, and seeds opening figures', () => {
    const { org, deps, figures, summaries } = harness()
    const rows = [
      row(1, { Player: 'Marco', Agent: 'North / East', Credit: '2000', Bal: '-450' }),
      row(2, { Player: 'Lena', Agent: 'North / East', Credit: '1500', Bal: '320' }),
      row(3, { Player: 'Solo', Agent: '', Credit: '500', Bal: '0' }),
    ]
    const res = commitBatch(batch(rows), rows, { actor: 'op', now: 123, deps })

    expect(res.status).toBe('committed')
    expect(res.summary).toMatchObject({ created: 3, skipped: 0, error: 0, newAgents: 2 })
    expect(
      membersByRole(org, 'player')
        .map((p) => p.name)
        .sort(),
    ).toEqual(['Lena', 'Marco', 'Solo'])

    // Opening figures went through the injected (audited) adjustFigure in SIGNED cents…
    expect(figures).toEqual([
      { id: expect.any(String), delta: -45000 },
      { id: expect.any(String), delta: 32000 },
    ]) // Solo's 0 figure was skipped (adjustFigure rejects a zero delta)
    const marco = membersByRole(org, 'player').find((p) => p.name === 'Marco')!
    expect(marco.account.balance).toBe(-45000)
    expect(marco.account.creditLimit).toBe(200000)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatch(/Imported 3 players/)
  })

  it('in balance (wallet) mode, skips a NEGATIVE opening figure but seeds a positive one (interlock #4)', () => {
    const { org, deps, figures } = harness()
    const rows = [
      row(1, { Player: 'Marco', Agent: '', Credit: '2000', Bal: '-450' }), // a debt — illegal in a wallet
      row(2, { Player: 'Lena', Agent: '', Credit: '1500', Bal: '320' }), // positive — fine
    ]
    const res = commitBatch(batch(rows), rows, { actor: 'op', now: 123, deps, economyMode: 'balance' })

    expect(res.status).toBe('committed')
    // Both players are still CREATED; only the figure seeding is mode-gated.
    expect(
      membersByRole(org, 'player')
        .map((p) => p.name)
        .sort(),
    ).toEqual(['Lena', 'Marco'])
    // Marco's negative opening figure was skipped (a wallet can't carry a debt); Lena's was seeded.
    expect(figures).toEqual([{ id: expect.any(String), delta: 32000 }])
    expect(membersByRole(org, 'player').find((p) => p.name === 'Marco')!.account.balance).toBe(0)
    expect(membersByRole(org, 'player').find((p) => p.name === 'Lena')!.account.balance).toBe(32000)
  })

  it('is idempotent — re-committing the same batch creates nothing twice', () => {
    const { org, deps, figures } = harness()
    const rows = [row(1, { Player: 'Marco', Agent: 'East', Credit: '2000', Bal: '-450' })]
    const first = commitBatch(batch(rows), rows, { actor: 'op', now: 1, deps })
    expect(first.summary.created).toBe(1)

    const playersAfterFirst = membersByRole(org, 'player').length
    const figureCalls = figures.length
    // Re-run with the committed rows (they now carry a live player_id).
    const second = commitBatch(batch(first.rows), first.rows, { actor: 'op', now: 2, deps })
    expect(membersByRole(org, 'player').length).toBe(playersAfterFirst) // no duplicate
    expect(figures.length).toBe(figureCalls) // figure not re-applied
    expect(second.rows[0].result).toBe('created') // still reported as created
    const marco = membersByRole(org, 'player')[0]
    expect(marco.account.balance).toBe(-45000) // not doubled
  })

  it('records per-row errors and reports failed when nothing is created', () => {
    const { org, deps } = harness(1000) // tiny manager credit
    const rows = [row(1, { Player: 'A', Agent: 'Big', Credit: '5000', Bal: '0' })]
    const res = commitBatch(batch(rows), rows, { actor: 'op', now: 1, deps })
    expect(res.status).toBe('failed')
    expect(res.summary).toMatchObject({ created: 0, error: 1 })
    expect(membersByRole(org, 'player')).toHaveLength(0)
  })

  it('marks a within-batch duplicate as skipped', () => {
    const { deps } = harness()
    const rows = [
      row(1, { Player: 'Sam', Agent: 'West', Credit: '800', Bal: '0' }),
      row(2, { Player: 'Sam', Agent: 'West', Credit: '800', Bal: '0' }),
    ]
    const res = commitBatch(batch(rows), rows, { actor: 'op', now: 1, deps })
    expect(res.summary).toMatchObject({ created: 1, skipped: 1 })
  })
})
