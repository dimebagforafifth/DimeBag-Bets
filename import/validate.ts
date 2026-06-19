/**
 * Pre-flight validation — a DRY RUN of the whole import against a CLONE of the live org, so
 * the operator sees exactly what will happen (created / skipped / errored, and how many agents
 * get reconstructed) before any money or member moves. Because it reuses the real tree builder
 * on a throwaway clone, the preview can't diverge from the commit, and nothing touches the
 * live book.
 *
 * A row that WOULD be created is reported as `pending` (validated, ready to commit), not
 * `created` — only the real commit creates. Errors and duplicates are final.
 */

import type { Org } from '../org/index.js'
import { applyMapping } from './mapping.js'
import { buildTree, type RowInput } from './tree.js'
import type { BatchSummary, ImportBatch, ImportRow } from './types.js'

export interface ValidationResult {
  rows: ImportRow[]
  summary: BatchSummary
}

/** Deep-clone an org for a throwaway dry run (structuredClone is in Node 18+ and browsers). */
function cloneOrg(org: Org): Org {
  return structuredClone(org)
}

/**
 * Validate a batch against the org: map every raw row, dry-run the tree build on a clone, and
 * fold the outcome back into each row. Pure — the passed org is never mutated.
 */
export function validateBatch(org: Org, batch: ImportBatch, rows: ImportRow[]): ValidationResult {
  // Map raw → canonical for every row first (so the stored row carries its mapped shape).
  const mappedRows: ImportRow[] = rows.map((r) => ({
    ...r,
    mapped: applyMapping(r.raw, batch.columnMap, batch.options),
  }))

  const inputs: RowInput[] = mappedRows
    .filter((r) => r.mapped !== null)
    .map((r) => ({ rowId: r.id, mapped: r.mapped! }))

  const build = buildTree(cloneOrg(org), inputs)
  const byRow = new Map(build.outcomes.map((o) => [o.rowId, o]))

  let created = 0
  let skipped = 0
  let error = 0
  const out: ImportRow[] = mappedRows.map((r) => {
    const o = byRow.get(r.id)
    if (!o) {
      // No outcome means the row had no mapped input (shouldn't happen post-mapping); treat as error.
      error += 1
      return { ...r, result: 'error', errorReason: 'could not be mapped' }
    }
    if (o.result === 'created') {
      created += 1
      // Dry run: ready-to-commit, not yet created.
      return { ...r, result: 'pending', errorReason: undefined, playerId: undefined }
    }
    if (o.result === 'skipped') {
      skipped += 1
      return { ...r, result: 'skipped', errorReason: o.errorReason }
    }
    error += 1
    return { ...r, result: 'error', errorReason: o.errorReason }
  })

  return {
    rows: out,
    summary: {
      rowCount: rows.length,
      created,
      skipped,
      error,
      newAgents: build.createdAgentCount,
    },
  }
}
