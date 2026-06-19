/**
 * Commit — the ONLY part of the import that moves real members and money. It:
 *   1. re-derives the mapped rows from their raw cells (mapping may have changed since validate),
 *   2. reconstructs the agent tree + creates the players on the LIVE org via `mutateBook`,
 *   3. seeds each player's opening figure through `adjustFigure` — the audited core path
 *      (adjustBalance + ledger + audit), so every cent is recorded and nothing writes a balance
 *      directly,
 *   4. records one summary audit entry for the batch.
 *
 * SAFETY: the live tree build is per-row resilient (a bad row is skipped, never aborts the run),
 * so the book can't be left half-built. IDEMPOTENT: a row already committed (has a live player_id)
 * is left alone, and the tree builder's own dedup skips any player that now already exists — so
 * re-running the same batch creates nothing twice. App-layer deps are injected (defaults bound to
 * the real book) so the money path is unit-testable without the global singleton.
 */

import { getMember, type Org } from '../org/index.js'
import { getEconomyMode, type EconomyMode } from '../core/index.js'
import { getBook, mutateBook } from '../app/book-store.js'
import { adjustFigure } from '../app/manager-actions.js'
import { recordAudit } from '../app/audit-store.js'
import { applyMapping } from './mapping.js'
import { buildTree, type RowInput } from './tree.js'
import type { BatchSummary, ImportBatch, ImportRow } from './types.js'

/** App-layer hooks the commit needs (injected for testing; defaults bind the live book). */
export interface CommitDeps {
  getBook: () => Org
  mutateBook: (fn: (org: Org) => void) => void
  adjustFigure: (memberId: string, delta: number, reason: string, actor: string) => void
  recordSummary: (detail: string, count: number, actor: string) => void
}

function defaultRecordSummary(detail: string, count: number, actor: string): void {
  recordAudit({ actor, action: 'bulk', memberId: '', memberName: `${count} players`, detail })
}

export const defaultCommitDeps: CommitDeps = {
  getBook,
  mutateBook,
  adjustFigure,
  recordSummary: defaultRecordSummary,
}

export interface CommitResult {
  rows: ImportRow[]
  summary: BatchSummary
  status: ImportBatch['status']
  committedAt: number
}

/** Is this row already committed against a player that still exists? (idempotent re-run). */
function alreadyCommitted(row: ImportRow, org: Org): boolean {
  return row.result === 'created' && !!row.playerId && !!org.members[row.playerId]
}

/**
 * Commit a batch onto the live book. Returns the updated rows + summary + final status. `now`
 * is supplied by the caller (the store/UI) so this stays free of ambient clock reads.
 */
export function commitBatch(
  batch: ImportBatch,
  rows: ImportRow[],
  opts: { actor: string; now: number; deps?: CommitDeps; economyMode?: EconomyMode },
): CommitResult {
  const deps = opts.deps ?? defaultCommitDeps
  // The active economy posture decides which opening figures may seed (Lane A interlock). Default
  // to the live book mode; a unit test (or the UI) can pass it explicitly. Credit/PPH carries any
  // figure incl. a carried debt; balance/wallet is non-negative, so it can't hold a debt figure.
  const economyMode = opts.economyMode ?? getEconomyMode()
  const liveOrg = deps.getBook()

  // Re-map every row from raw; keep already-committed rows untouched (idempotency).
  const remapped: ImportRow[] = rows.map((r) => ({
    ...r,
    mapped: applyMapping(r.raw, batch.columnMap, batch.options),
  }))
  const toProcess = remapped.filter((r) => !alreadyCommitted(r, liveOrg))
  const inputs: RowInput[] = toProcess
    .filter((r) => r.mapped !== null)
    .map((r) => ({ rowId: r.id, mapped: r.mapped! }))

  // Build the tree + create the players on the LIVE org in one persisted mutation.
  let build = {
    outcomes: [] as ReturnType<typeof buildTree>['outcomes'],
    createdAgentCount: 0,
    createdPlayers: [] as ReturnType<typeof buildTree>['createdPlayers'],
  }
  deps.mutateBook((org) => {
    build = buildTree(org, inputs)
  })

  // Seed opening figures through the audited core path. Skip zero (adjustFigure rejects it) and,
  // in the non-negative balance (wallet) economy, skip a NEGATIVE opening figure — a wallet can't
  // carry a debt, so we only seed a figure the active mode can legally hold. Credit/PPH carries any
  // figure; balance/wallet only a non-negative one.
  const seedsFigure = (cents: number) =>
    cents !== 0 && !(economyMode === 'balance' && cents < 0)
  for (const cp of build.createdPlayers) {
    if (!seedsFigure(cp.startingBalanceCents)) continue
    try {
      deps.adjustFigure(
        cp.playerId,
        cp.startingBalanceCents,
        `Imported opening figure from “${batch.sourceLabel}”`,
        opts.actor,
      )
    } catch {
      // A balance that can't be seeded doesn't undo the created player; the row stays created
      // with a 0 figure, and the operator can adjust it manually. (Shouldn't happen: adjustBalance
      // bypasses the credit limit; only a non-integer/zero delta is rejected, which we've filtered.)
    }
  }

  // Fold outcomes back into the rows (already-committed rows keep their created state).
  const byRow = new Map(build.outcomes.map((o) => [o.rowId, o]))
  let created = 0
  let skipped = 0
  let error = 0
  const out: ImportRow[] = remapped.map((r) => {
    if (alreadyCommitted(r, liveOrg)) {
      created += 1
      return r
    }
    const o = byRow.get(r.id)
    if (!o) {
      error += 1
      return { ...r, result: 'error', errorReason: 'could not be mapped' }
    }
    if (o.result === 'created') created += 1
    else if (o.result === 'skipped') skipped += 1
    else error += 1
    return {
      ...r,
      result: o.result,
      errorReason: o.errorReason,
      playerId: o.playerId ?? r.playerId,
    }
  })

  const newlyCreated = build.createdPlayers.length
  const status: ImportBatch['status'] = created > 0 ? 'committed' : 'failed'
  if (newlyCreated > 0 || build.createdAgentCount > 0) {
    const figures = build.createdPlayers.filter((c) => seedsFigure(c.startingBalanceCents)).length
    deps.recordSummary(
      `Imported ${newlyCreated} player${newlyCreated === 1 ? '' : 's'}` +
        (build.createdAgentCount ? ` + ${build.createdAgentCount} agent(s)` : '') +
        (figures ? ` with opening figures` : '') +
        ` from “${batch.sourceLabel}”`,
      newlyCreated,
      opts.actor,
    )
  }

  return {
    rows: out,
    summary: { rowCount: rows.length, created, skipped, error, newAgents: build.createdAgentCount },
    status,
    committedAt: opts.now,
  }
}

/** A read-only helper for the panel: confirm a created row still points at a live member. */
export function createdMemberName(row: ImportRow): string | null {
  if (!row.playerId) return null
  try {
    return getMember(getBook(), row.playerId).name
  } catch {
    return null
  }
}
