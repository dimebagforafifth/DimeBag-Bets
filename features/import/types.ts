/**
 * Operator migration & player import — the contract.
 *
 * Goal: move a whole book onto us with near-zero friction. An operator uploads their
 * existing player list (CSV), maps the columns once (auto-detected), previews a dry-run,
 * then commits — which CREATES the players, RECONSTRUCTS the agent tree, and seeds each
 * player's starting figure. Every money/account move routes through `core` (via the
 * audited app-layer wrappers); this module never writes a balance directly and never
 * moves money on load — only on an explicit commit.
 *
 * Mirrors the schema the brief specifies: import_batch / import_row / import_mapping_template.
 */

import type { MemberProfile } from '../org/index.js'

/** Where a batch is in its lifecycle. */
export type ImportStatus = 'draft' | 'validated' | 'committed' | 'failed'

/** Per-row outcome. `pending` = not yet validated/committed. */
export type RowResult = 'pending' | 'created' | 'skipped' | 'error'

/** The canonical player fields a source column can map onto. */
export type CanonicalField =
  | 'name'
  | 'agent'
  | 'creditLimit'
  | 'startingBalance'
  | 'nickname'
  | 'email'
  | 'phone'
  | 'externalId'
  | 'notes'

/** A column mapping: canonical field → the SOURCE column header that feeds it. A field
 *  with no entry is simply absent from the import. */
export type ColumnMap = Partial<Record<CanonicalField, string>>

/** Options that tune how raw cells become canonical values. */
export interface MappingOptions {
  /** Splits the `agent` cell into a path, e.g. 'North / East Desk' → ['North','East Desk'].
   *  Default '/'. */
  agentDelimiter: string
  /** True (default): money cells are human dollars ('$1,200.50') → cents. False: the cells
   *  are already integer cents. */
  amountsInDollars: boolean
}

export const DEFAULT_MAPPING_OPTIONS: MappingOptions = {
  agentDelimiter: '/',
  amountsInDollars: true,
}

/** A raw CSV row mapped onto the canonical player shape (the result of applyMapping). */
export interface MappedPlayer {
  name: string
  /** The agent chain from the manager down to the player's direct parent. `[]` = the
   *  player attaches directly under the manager (a house-direct player); `[agent]` = one
   *  agent under the manager; `[subagent, agent]` = a sub-agent then an agent. */
  agentPath: string[]
  /** Credit line in integer cents (≥ 0). 0 when unmapped. */
  creditLimitCents: number
  /** Opening figure in SIGNED integer cents (the player's standing on the old book:
   *  positive = book owes them, negative = they owe). 0 when unmapped. */
  startingBalanceCents: number
  profile: MemberProfile
  /** The source system's id for this player, if a column maps to it (used for dedup). */
  externalId?: string
}

/** A persisted import batch (one uploaded file / paste). */
export interface ImportBatch {
  id: string
  tenantId: string
  /** Human label, e.g. the file name or 'Acme Book — May export'. */
  sourceLabel: string
  status: ImportStatus
  rowCount: number
  createdCount: number
  skippedCount: number
  errorCount: number
  /** Who ran the import (the operator), for the audit trail. */
  createdBy: string
  createdAt: number
  committedAt?: number
  /** The headers detected from the source, in order. */
  headers: string[]
  columnMap: ColumnMap
  options: MappingOptions
}

/** A persisted import row. `raw` is the source cells; `mapped` is the canonical shape;
 *  `result` + `errorReason` carry the validate/commit outcome; `playerId` links the
 *  created member (also the idempotency anchor on re-commit). */
export interface ImportRow {
  id: string
  batchId: string
  raw: Record<string, string>
  mapped: MappedPlayer | null
  result: RowResult
  errorReason?: string
  playerId?: string
}

/** A reusable column-mapping template (so the second import of the same source is one tap). */
export interface MappingTemplate {
  id: string
  name: string
  columnMap: ColumnMap
  options: MappingOptions
}

/** The roll-up the UI shows after validate/commit. */
export interface BatchSummary {
  rowCount: number
  created: number
  skipped: number
  error: number
  /** Distinct agents/sub-agents the commit will create (the reconstructed tree). */
  newAgents: number
}
