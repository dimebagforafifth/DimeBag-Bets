/**
 * Reporting & analytics — read-only operator insight (CLAUDE.md §4). Pure rollups
 * over a durable, persisted feed of every settled wager + bonus. Public surface.
 */

export {
  inRange,
  bookActivity,
  perGameHold,
  perPlayerActivity,
  engagement,
  toCSV,
  type AnalyticsRecord,
  type BookActivity,
  type GameHold,
  type PlayerActivity,
  type Engagement,
} from './analytics.js'
export { createAnalyticsStore, MAX_RECORDS, type AnalyticsStore, type AnalyticsDoc, type LedgerLike } from './analytics-store.js'
export {
  analytics,
  initAnalyticsCapture,
  getAnalyticsRecords,
  subscribeAnalytics,
  analyticsVersion,
} from './capture.js'
export { ReportingPage } from './ui/ReportingPage.js'
