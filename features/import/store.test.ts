// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { listPlayers } from '../../app/book-store.js'
import {
  __resetImport,
  __seedImport,
  applyTemplate,
  commit,
  createBatchFromCsv,
  getBatch,
  getRows,
  getTemplates,
  listBatches,
  updateMapping,
  validate,
} from './index.js'

beforeEach(() => __resetImport())

const SAMPLE = `Player Name,Agent,Credit Limit,Balance,Email
Wade Imports,Importtown / Desk 9,1500,-200,wade@example.com
Nora Imports,Importtown / Desk 9,1000,150,nora@example.com`

describe('import store', () => {
  it('auto-seeds a realistic demo (records only — no members, no money)', () => {
    const playersBefore = listPlayers().length
    __seedImport()
    expect(listBatches().length).toBeGreaterThanOrEqual(2)
    expect(getTemplates().length).toBeGreaterThanOrEqual(1)
    // The seed creates no players (it's just import records until the operator commits).
    expect(listPlayers().length).toBe(playersBefore)
  })

  it('creates a draft from CSV and auto-detects the column mapping', () => {
    const b = createBatchFromCsv({ sourceLabel: 'x.csv', csv: SAMPLE, createdBy: 'op', now: 1 })
    expect(b.status).toBe('draft')
    expect(b.rowCount).toBe(2)
    expect(b.columnMap).toMatchObject({
      name: 'Player Name',
      agent: 'Agent',
      creditLimit: 'Credit Limit',
      startingBalance: 'Balance',
      email: 'Email',
    })
    expect(getRows(b.id)).toHaveLength(2)
    expect(getRows(b.id)[0].mapped?.agentPath).toEqual(['Importtown', 'Desk 9'])
  })

  it('validate projects outcomes; commit creates the players + figures in the live book', () => {
    const b = createBatchFromCsv({ sourceLabel: 'x.csv', csv: SAMPLE, createdBy: 'op', now: 1 })

    const summary = validate(b.id)!
    expect(summary).toMatchObject({ created: 2, skipped: 0, error: 0 })
    expect(getBatch(b.id)!.status).toBe('validated')
    // Dry run created nobody yet.
    expect(listPlayers().some((p) => p.name === 'Wade Imports')).toBe(false)

    const committed = commit(b.id, { actor: 'op', now: 2 })!
    expect(committed.created).toBe(2)
    expect(getBatch(b.id)!.status).toBe('committed')
    const wade = listPlayers().find((p) => p.name === 'Wade Imports')!
    expect(wade).toBeTruthy()
    expect(wade.account.balance).toBe(-20000) // -$200 opening figure, via the audited path
  })

  it('re-mapping resets the batch to draft and re-derives rows', () => {
    const b = createBatchFromCsv({ sourceLabel: 'x.csv', csv: SAMPLE, createdBy: 'op', now: 1 })
    validate(b.id)
    expect(getBatch(b.id)!.status).toBe('validated')
    updateMapping(b.id, { name: 'Player Name' }, getBatch(b.id)!.options) // drop the agent mapping
    expect(getBatch(b.id)!.status).toBe('draft')
    expect(getRows(b.id)[0].mapped?.agentPath).toEqual([]) // agent no longer mapped
  })

  it('applies a saved template to a draft', () => {
    __seedImport()
    const tpl = getTemplates()[0]
    const b = createBatchFromCsv({ sourceLabel: 'x.csv', csv: SAMPLE, createdBy: 'op', now: 1 })
    applyTemplate(b.id, tpl.id)
    expect(getBatch(b.id)!.columnMap).toEqual(tpl.columnMap)
  })
})
