/**
 * AI Manager Copilot (advisory). Reads a read-only book snapshot and returns
 * ranked, explained recommendations; the manager approves any action. A
 * deterministic rules engine today; the premium upgrade swaps in an LLM behind the
 * same `analyze(snapshot)` interface. Public surface.
 */

export { buildSnapshot, type BookSnapshot } from './snapshot.js'
export { analyze, type Recommendation, type Priority, type Area } from './insights.js'
export { CopilotPage } from './ui/CopilotPage.js'
