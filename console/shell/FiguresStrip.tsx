/**
 * The figures strip: My Balance · This Week · Today · Active Accounts. Prop-driven
 * with sane defaults — no dummy numbers. This Week / Today take an optional trend
 * that tints the value up (green) or down (red). Collapses to 2-up on mobile.
 *
 * Values are passed display-ready (strings) so the shell stays decoupled from any
 * particular money model; the integration layer formats them.
 */

export type Trend = 'up' | 'down' | 'flat'

export interface FiguresStripProps {
  balance?: string
  week?: string
  weekTrend?: Trend
  today?: string
  todayTrend?: Trend
  activeAccts?: number | string
}

export function FiguresStrip({
  balance = '—',
  week = '—',
  weekTrend = 'flat',
  today = '—',
  todayTrend = 'flat',
  activeAccts = 0,
}: FiguresStripProps) {
  return (
    <div className="c-figures" role="group" aria-label="Key figures">
      <Figure label="My Balance" value={balance} />
      <Figure label="This Week" value={week} trend={weekTrend} />
      <Figure label="Today" value={today} trend={todayTrend} />
      <Figure label="Active Accounts" value={String(activeAccts)} />
    </div>
  )
}

function Figure({ label, value, trend = 'flat' }: { label: string; value: string; trend?: Trend }) {
  return (
    <div className="c-figure">
      <span className="c-eyebrow c-figure-label">{label}</span>
      <span className={`c-figure-value is-${trend}`}>{value}</span>
    </div>
  )
}
