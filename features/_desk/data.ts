/**
 * Money-desk pure helpers — the correctness-critical logic shared by the figures /
 * cashier / transactions / settlements panels, kept side-effect-free so it unit-tests
 * without React or the stores. Everything is integer COINS (cents); nothing here
 * mutates money — the panels route every mutation through core via the app stores.
 */

export const DAY_MS = 86_400_000

// ── Cashier: Grant / Deduct / Set → a single signed core delta ───────────────
// core has no "set balance" primitive (only signed adjustBalance), so a Set is
// always expressed as the delta that lands the figure on the target.
export type CashAction = 'grant' | 'deduct' | 'set'

/** Signed cents to apply for a cashier action. `cents` is the magnitude the operator
 *  typed (a Set's `cents` is the target balance). grant → +cents, deduct → −cents,
 *  set → cents − current. A zero result is a no-op the caller must skip (adjustFigure
 *  throws on a zero delta). */
export function toDelta(action: CashAction, cents: number, currentBalance: number): number {
  switch (action) {
    case 'grant':
      return cents
    case 'deduct':
      return -cents
    case 'set':
      return cents - currentBalance
  }
}

/** The balance a cashier action lands on, for the live preview. */
export function previewBalance(action: CashAction, cents: number, currentBalance: number): number {
  return currentBalance + toDelta(action, cents, currentBalance)
}

// ── Figures: per-player, per-day win/loss windows ────────────────────────────
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface DayWindow {
  start: number // local midnight, epoch ms
  end: number // start + DAY_MS
  label: string // short weekday, e.g. "Mon"
  iso: string // YYYY-MM-DD (stable column id / CSV header)
}

/** The last `days` calendar-day windows ending with the day containing `now`,
 *  oldest→newest. Pure given `now`. Day columns are sliced from these. */
export function dayWindows(now: number, days = 7): DayWindow[] {
  const m = new Date(now)
  m.setHours(0, 0, 0, 0)
  const todayStart = m.getTime()
  const out: DayWindow[] = []
  for (let i = days - 1; i >= 0; i--) {
    const start = todayStart - i * DAY_MS
    const d = new Date(start)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    out.push({ start, end: start + DAY_MS, label: WEEKDAY[d.getDay()], iso })
  }
  return out
}

/** Net dollars (signed profit) for one account inside [start, end). Structural over
 *  manager/reporting AnalyticsRecord so tests don't need the store. */
export function dayNet(
  records: ReadonlyArray<{ accountId: string; time: number; profit: number }>,
  accountId: string,
  start: number,
  end: number,
): number {
  let net = 0
  for (const r of records) {
    if (r.accountId === accountId && r.time >= start && r.time < end) net += r.profit
  }
  return net
}

// ── Transactions: read-only ledger filtering ─────────────────────────────────
export interface LedgerFilter {
  accountId?: string | null
  kind?: string | null
  from?: number | null // epoch ms inclusive
  to?: number | null // epoch ms inclusive
}

/** Filter a durable ledger snapshot in render (structural over LedgerEntry). Never
 *  mutates; preserves order. */
export function filterLedger<T extends { accountId: string; kind: string; at: number }>(
  entries: ReadonlyArray<T>,
  f: LedgerFilter,
): T[] {
  return entries.filter(
    (e) =>
      (!f.accountId || e.accountId === f.accountId) &&
      (!f.kind || e.kind === f.kind) &&
      (f.from == null || e.at >= f.from) &&
      (f.to == null || e.at <= f.to),
  )
}

/** Start-of-day / end-of-day epoch ms for a YYYY-MM-DD date input (local). Used to
 *  turn the date-range filter inputs into [from, to] bounds. */
export function dayStart(isoDate: string): number {
  const d = new Date(`${isoDate}T00:00:00`)
  return d.getTime()
}
export function dayEnd(isoDate: string): number {
  return dayStart(isoDate) + DAY_MS - 1
}

// ── Shared CSV serializer (self-contained, RFC-4180-ish escaping) ────────────
export function rowsToCsv(
  rows: ReadonlyArray<Record<string, string | number>>,
  columns?: readonly string[],
): string {
  if (rows.length === 0) return ''
  const cols = columns ?? Object.keys(rows[0])
  const esc = (v: string | number): string => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = cols.join(',')
  const body = rows.map((r) => cols.map((c) => esc(r[c] ?? '')).join(',')).join('\n')
  return `${head}\n${body}`
}
