/**
 * Import store — the persisted state (batches, rows, templates) plus the operations the panel
 * drives: create a draft from uploaded CSV, tune the column mapping, validate (dry-run), and
 * commit (create members + figures through core). Same persistence pattern as the other app
 * stores (createStore → persistedDoc, subscribe/version), so it's localStorage by default and
 * Supabase-backed when keys are present — byte-identical with no keys.
 *
 * Ids are minted from a persisted counter (no clock / no randomness here); the caller supplies
 * `now` for timestamps. The store auto-seeds a realistic demo on first load (records only — it
 * creates no members and moves no money until the operator commits).
 */

import { createStore, persistedDoc, getActiveTenant, type Doc } from '../../persistence/index.js'
import type { EconomyMode } from '../../core/index.js'
import { getBook } from '../../app/book-store.js'
import { parseCsv } from './csv.js'
import { autoDetectMapping, applyMapping } from './mapping.js'
import { validateBatch } from './validate.js'
import { commitBatch, type CommitDeps } from './commit.js'
import { SEED_SOURCES, SEED_TEMPLATES } from './seed.js'
import {
  DEFAULT_MAPPING_OPTIONS,
  type BatchSummary,
  type ColumnMap,
  type ImportBatch,
  type ImportRow,
  type MappingOptions,
  type MappingTemplate,
} from './types.js'

interface ImportState {
  seq: number
  batches: ImportBatch[]
  rows: Record<string, ImportRow[]>
  templates: MappingTemplate[]
}

const INITIAL: ImportState = { seq: 0, batches: [], rows: {}, templates: [] }

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<ImportState> = persistedDoc<ImportState>(store, 'import.state', {
  version: 1,
  initial: INITIAL,
})

let state: ImportState = DOC.load() ?? INITIAL
let version = 0
const listeners = new Set<() => void>()

function notify(): void {
  DOC.save(state)
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeImport(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function importVersion(): number {
  return version
}

function nextId(prefix: string): string {
  state.seq += 1
  return `${prefix}-${state.seq}`
}

/* ------------------------------- reads ----------------------------------- */

export function listBatches(): ImportBatch[] {
  return [...state.batches].sort((a, b) => b.createdAt - a.createdAt)
}
export function getBatch(id: string): ImportBatch | undefined {
  return state.batches.find((b) => b.id === id)
}
export function getRows(batchId: string): ImportRow[] {
  return state.rows[batchId] ?? []
}
export function getTemplates(): MappingTemplate[] {
  return state.templates
}

/* ------------------------------ mutations -------------------------------- */

function setBatch(batch: ImportBatch): void {
  state = { ...state, batches: state.batches.map((b) => (b.id === batch.id ? batch : b)) }
}
function setRows(batchId: string, rows: ImportRow[]): void {
  state = { ...state, rows: { ...state.rows, [batchId]: rows } }
}

/** Build the rows for a batch from raw cells under the current mapping (result reset to pending). */
function mapRows(
  batchId: string,
  rawRows: Record<string, string>[],
  map: ColumnMap,
  opts: MappingOptions,
): ImportRow[] {
  return rawRows.map((raw, i) => ({
    id: `${batchId}-r${i + 1}`,
    batchId,
    raw,
    mapped: applyMapping(raw, map, opts),
    result: 'pending' as const,
  }))
}

/** Create a draft batch from CSV text. Auto-detects the column mapping. */
export function createBatchFromCsv(input: {
  sourceLabel: string
  csv: string
  createdBy: string
  now: number
}): ImportBatch {
  const { headers, rows: rawRows } = parseCsv(input.csv)
  const columnMap = autoDetectMapping(headers)
  const options: MappingOptions = { ...DEFAULT_MAPPING_OPTIONS }
  const id = nextId('batch')
  const batch: ImportBatch = {
    id,
    tenantId: getActiveTenant(),
    sourceLabel: input.sourceLabel,
    status: 'draft',
    rowCount: rawRows.length,
    createdCount: 0,
    skippedCount: 0,
    errorCount: 0,
    createdBy: input.createdBy,
    createdAt: input.now,
    headers,
    columnMap,
    options,
  }
  state = {
    ...state,
    batches: [batch, ...state.batches],
    rows: { ...state.rows, [id]: mapRows(id, rawRows, columnMap, options) },
  }
  notify()
  return batch
}

/** Re-map a draft after the operator edits the column mapping / options. Resets to draft. */
export function updateMapping(
  batchId: string,
  columnMap: ColumnMap,
  options: MappingOptions,
): void {
  const batch = getBatch(batchId)
  if (!batch) return
  const rawRows = getRows(batchId).map((r) => r.raw)
  setBatch({
    ...batch,
    columnMap,
    options,
    status: 'draft',
    createdCount: 0,
    skippedCount: 0,
    errorCount: 0,
  })
  setRows(batchId, mapRows(batchId, rawRows, columnMap, options))
  notify()
}

/** Dry-run the batch against the live book; store the projected per-row outcomes + counts. */
export function validate(batchId: string): BatchSummary | undefined {
  const batch = getBatch(batchId)
  if (!batch) return undefined
  const result = validateBatch(getBook(), batch, getRows(batchId))
  setBatch({
    ...batch,
    status: 'validated',
    rowCount: result.summary.rowCount,
    createdCount: result.summary.created,
    skippedCount: result.summary.skipped,
    errorCount: result.summary.error,
  })
  setRows(batchId, result.rows)
  notify()
  return result.summary
}

/** Commit the batch: create the members + agent tree + opening figures through core. */
export function commit(
  batchId: string,
  opts: { actor: string; now: number; deps?: CommitDeps; economyMode?: EconomyMode },
): BatchSummary | undefined {
  const batch = getBatch(batchId)
  if (!batch) return undefined
  const result = commitBatch(batch, getRows(batchId), opts)
  setBatch({
    ...batch,
    status: result.status,
    createdCount: result.summary.created,
    skippedCount: result.summary.skipped,
    errorCount: result.summary.error,
    committedAt: result.committedAt,
  })
  setRows(batchId, result.rows)
  notify()
  return result.summary
}

export function deleteBatch(batchId: string): void {
  const rows = { ...state.rows }
  delete rows[batchId]
  state = { ...state, batches: state.batches.filter((b) => b.id !== batchId), rows }
  notify()
}

/* ------------------------------ templates -------------------------------- */

export function saveTemplate(
  name: string,
  columnMap: ColumnMap,
  options: MappingOptions,
): MappingTemplate {
  const tpl: MappingTemplate = { id: nextId('tpl'), name, columnMap, options }
  state = { ...state, templates: [...state.templates, tpl] }
  notify()
  return tpl
}
export function deleteTemplate(id: string): void {
  state = { ...state, templates: state.templates.filter((t) => t.id !== id) }
  notify()
}
export function applyTemplate(batchId: string, templateId: string): void {
  const tpl = state.templates.find((t) => t.id === templateId)
  if (!tpl) return
  updateMapping(batchId, tpl.columnMap, tpl.options)
}

/* -------------------------------- seed ----------------------------------- */

/** Fixed seed timestamps (no clock reads in the module): two recent-looking drafts. */
const SEED_NOW = 1_718_000_000_000 // ~2024-06-10
function seedIfEmpty(): void {
  if (state.batches.length > 0 || state.templates.length > 0) return
  state = { ...state, templates: [...SEED_TEMPLATES] }
  SEED_SOURCES.forEach((src, i) => {
    createBatchFromCsv({
      sourceLabel: src.sourceLabel,
      csv: src.csv,
      createdBy: src.createdBy,
      now: SEED_NOW - i * 3_600_000,
    })
  })
}
seedIfEmpty()

/* -------------------------------- tests ---------------------------------- */

/** Clear all import state (tests). Does NOT re-seed. */
export function __resetImport(): void {
  state = { seq: 0, batches: [], rows: {}, templates: [] }
  notify()
}
/** Re-run the demo seed (tests). */
export function __seedImport(): void {
  seedIfEmpty()
}
