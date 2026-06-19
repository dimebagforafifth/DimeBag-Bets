/**
 * Operator migration & player import — public surface.
 *
 * An operator moves their whole book onto us with near-zero friction: upload the existing
 * player list (CSV), confirm the auto-detected column mapping, preview a dry run, then commit —
 * which CREATES the players, RECONSTRUCTS the agent tree, and seeds each opening figure through
 * the audited core money path. Mock/localStorage by default; no money moves on load.
 *
 * (Intentionally NO data-EXPORT / lock-out path — switching TO us is the product; locking
 * operators in is not. // SEAM: a future portability export, if ever wanted, lives elsewhere.)
 */

export type {
  ImportStatus,
  RowResult,
  CanonicalField,
  ColumnMap,
  MappingOptions,
  MappedPlayer,
  ImportBatch,
  ImportRow,
  MappingTemplate,
  BatchSummary,
} from './types.js'
export { DEFAULT_MAPPING_OPTIONS } from './types.js'

export { parseCsv, type ParsedCsv } from './csv.js'
export { autoDetectMapping, applyMapping, parseAmountCents, splitAgentPath } from './mapping.js'
export { buildTree, type RowInput, type RowOutcome, type BuildResult } from './tree.js'
export { validateBatch, type ValidationResult } from './validate.js'
export { commitBatch, defaultCommitDeps, type CommitDeps, type CommitResult } from './commit.js'

export {
  subscribeImport,
  importVersion,
  listBatches,
  getBatch,
  getRows,
  getTemplates,
  createBatchFromCsv,
  updateMapping,
  validate,
  commit,
  deleteBatch,
  saveTemplate,
  deleteTemplate,
  applyTemplate,
  __resetImport,
  __seedImport,
} from './store.js'

export { SEED_SOURCES, SEED_TEMPLATES } from './seed.js'
