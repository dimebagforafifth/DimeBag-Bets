import { describe, expect, it } from 'vitest'
import { addAgent, addPlayer, createOrg, getMember, membersByRole, type Org } from '../org/index.js'
import { validateBatch } from './validate.js'
import { DEFAULT_MAPPING_OPTIONS, type ImportBatch, type ImportRow } from './types.js'

const HEADERS = ['Player', 'Agent', 'Credit', 'Bal']
const batch = (rows: ImportRow[]): ImportBatch => ({
  id: 'b1',
  tenantId: 'default',
  sourceLabel: 'Acme',
  status: 'draft',
  rowCount: rows.length,
  createdCount: 0,
  skippedCount: 0,
  errorCount: 0,
  createdBy: 'op',
  createdAt: 0,
  headers: HEADERS,
  columnMap: { name: 'Player', agent: 'Agent', creditLimit: 'Credit', startingBalance: 'Bal' },
  options: DEFAULT_MAPPING_OPTIONS,
})
const row = (i: number, raw: Record<string, string>): ImportRow => ({
  id: `b1-r${i}`,
  batchId: 'b1',
  raw,
  mapped: null,
  result: 'pending',
})
const freshOrg = (): Org => createOrg({ name: 'Book', creditLimit: 100_000_000, id: 'mgr' })

describe('validateBatch — dry run on a clone, never mutates the live org', () => {
  it('projects created / skipped / error and counts the new agents', () => {
    const org = freshOrg()
    const rows = [
      row(1, { Player: 'Marco', Agent: 'North / East', Credit: '2000', Bal: '-450' }),
      row(2, { Player: 'Marco', Agent: 'North / East', Credit: '2000', Bal: '-450' }), // dup → skip
      row(3, { Player: '', Agent: 'South', Credit: '1000', Bal: '0' }), // no name → error
    ]
    const { rows: out, summary } = validateBatch(org, batch(rows), rows)
    expect(summary).toMatchObject({ rowCount: 3, created: 1, skipped: 1, error: 1, newAgents: 2 })
    // a would-create row is reported as pending (not yet created), with its mapped shape filled.
    expect(out[0].result).toBe('pending')
    expect(out[0].mapped?.agentPath).toEqual(['North', 'East'])
    expect(out[1].result).toBe('skipped')
    expect(out[2].result).toBe('error')
  })

  it('leaves the passed org completely untouched (clone isolation)', () => {
    const org = freshOrg()
    const rows = [row(1, { Player: 'Marco', Agent: 'East', Credit: '2000', Bal: '-450' })]
    validateBatch(org, batch(rows), rows)
    expect(membersByRole(org, 'player')).toHaveLength(0)
    expect(membersByRole(org, 'agent')).toHaveLength(0)
    expect(Object.keys(org.members)).toEqual(['mgr'])
  })

  it('does not leak the existing-agent credit top-up through the dry run', () => {
    const org = freshOrg()
    const east = addAgent(org, 'mgr', { name: 'East', creditLimit: 2000 })
    addPlayer(org, east.id, { name: 'Marco', creditLimit: 2000 }) // East now full (no headroom)
    const rows = [row(1, { Player: 'Lena', Agent: 'East', Credit: '1500', Bal: '0' })]
    validateBatch(org, batch(rows), rows) // would top East up to 3500 + add Lena — on the clone only
    expect(getMember(org, east.id).account.creditLimit).toBe(2000) // live agent's line unchanged
    expect(membersByRole(org, 'player').map((p) => p.name)).toEqual(['Marco']) // no Lena on the live org
  })
})
