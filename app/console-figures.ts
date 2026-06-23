/**
 * Real figures for the console's FiguresStrip — computed from the book + the durable
 * analytics feed (CLAUDE.md §4, honest by default). Pure + testable; the App passes
 * the live book, the analytics records, the clock, and the active-account count.
 *
 *  - My Balance     → the book's rolled-up figure (the operator's standing).
 *  - This Week/Today → the house net over that window, tinted up/down by sign.
 *  - Active Accounts → the live active-player count.
 *
 * Display-ready strings, matching FiguresStrip's prop contract.
 */
import { bookFigure, type Org } from '../features/org/index.js'
import { formatMoney } from '../games/shared/money.js'
import { bookActivity, inRange, type AnalyticsRecord } from '../manager/reporting/index.js'

export type Trend = 'up' | 'down' | 'flat'

export interface ConsoleFigures {
  balance: string
  week: string
  weekTrend: Trend
  today: string
  todayTrend: Trend
  activeAccts: number
}

const DAY = 86_400_000
const trendOf = (n: number): Trend => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat')

export interface FiguresScope {
  /** Whose rolled-up figure to show as the balance (default: the manager/whole book). */
  scopeId?: string
  /** Restrict the week/today house-net to these account ids (an agent's roster), so an
   *  agent never sees the whole book's activity. Omit for the whole book. */
  accountIds?: ReadonlySet<string>
}

export function consoleFigures(
  org: Org,
  records: AnalyticsRecord[],
  now: number,
  activeAccts: number,
  scope: FiguresScope = {},
): ConsoleFigures {
  const scopeId = scope.scopeId ?? org.managerId
  const recs = scope.accountIds ? records.filter((r) => scope.accountIds!.has(r.accountId)) : records
  const weekNet = bookActivity(inRange(recs, now - 7 * DAY, now + 1)).houseNet
  const todayNet = bookActivity(inRange(recs, now - DAY, now + 1)).houseNet
  return {
    balance: formatMoney(bookFigure(org, scopeId)),
    week: formatMoney(weekNet),
    weekTrend: trendOf(weekNet),
    today: formatMoney(todayNet),
    todayTrend: trendOf(todayNet),
    activeAccts,
  }
}
