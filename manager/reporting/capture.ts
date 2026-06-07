/**
 * Wires the durable analytics store (analytics-store.ts) to the live app ledger
 * and to persistence — the one place that touches the browser/app singletons, kept
 * out of the testable factory.
 *
 * It mirrors every settled wager / bonus off `app/ledger-store` into a permanent,
 * timestamped log under the shared 'dimebag' namespace, so operator reporting can
 * look back across sessions. On first run it BACKFILLS the recent on-screen ledger
 * snapshot, then captures live. Capture starts as soon as anything imports this
 * module; for full day-one coverage the shell can `import` it (or call
 * `initAnalyticsCapture()`) at boot — see manager/README.md.
 */

import { createLocalStore, persistedDoc } from '../../persistence/index.js'
import { getLedger, subscribeLedger } from '../../app/ledger-store.js'
import { createAnalyticsStore, type AnalyticsDoc } from './analytics-store.js'

const kv = createLocalStore({ namespace: 'dimebag' })
const doc = persistedDoc<AnalyticsDoc>(kv, 'manager.analytics', {
  version: 1,
  initial: { lastId: 0, records: [] },
})

/** The live, persisted analytics store the reporting UI reads. */
export const analytics = createAnalyticsStore(doc)

let wired = false
/** Idempotent: backfill the current ledger snapshot, then subscribe for live
 *  appends. Safe to call from anywhere; runs once. */
export function initAnalyticsCapture(): void {
  if (wired) return
  wired = true
  analytics.ingest(getLedger())
  subscribeLedger(() => analytics.ingest(getLedger()))
}

// Self-wire on import so capture begins the moment the manager layer loads.
initAnalyticsCapture()

/* useSyncExternalStore-friendly accessors for the reporting UI. */
export const getAnalyticsRecords = (): ReturnType<typeof analytics.records> => analytics.records()
export const subscribeAnalytics = (listener: () => void): (() => void) => analytics.subscribe(listener)
export const analyticsVersion = (): number => analytics.version()
