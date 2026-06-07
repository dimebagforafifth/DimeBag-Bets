/**
 * Ledger module public surface (CLAUDE.md §3). Route core money calls through a
 * `Ledger` to get an immutable history alongside the live figure; `summarize`
 * rolls entries into turnover + net P&L. To persist the log, pair an entries
 * array with the `persistence` module — the ledger holds no storage of its own.
 */

export type { Ledger, LedgerEntry, LedgerKind, LedgerSummary } from './ledger.js'
export { createLedger, summarize } from './ledger.js'
