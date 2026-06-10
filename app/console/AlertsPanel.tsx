import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { formatMoney, toCents } from '../../games/shared/money.js'
import {
  setActive,
  setBettingLocked,
  setCreditLimit,
  type Member,
  type Org,
} from '../../org/index.js'
import { getBook, getBookVersion, subscribeBook } from '../book-store.js'
import { getBookLedger, subscribeBookLedger } from '../book-ledger.js'
import { totalOpenExposure, getExposureVersion, subscribeExposure } from '../exposure.js'
import { toBetRows } from '../ledger-stats.js'
import { auditedMutate } from '../manager-actions.js'
import {
  getRiskThresholds,
  getSettingsVersion,
  setRiskCreditUtil,
  setRiskExposureCap,
  subscribeSettings,
} from '../settings-store.js'
import {
  ALERT_TYPE_META,
  buildOperatorAlerts,
  filterAlerts,
  summarizeAlerts,
  type AlertFilter,
  type OperatorAlert,
} from './alerts.js'
import './alerts-panel.css'

/**
 * Operator alerts — a live watchlist of what needs the manager's eyes: exposure over
 * cap, a player near their credit line, a big win, or a large open position. The pure
 * signal logic lives in alerts.ts; this wires the live stores (ledger + book + exposure
 * + settings) and adds the operator surface around the signals:
 *   - a counts bar (by type + severity) for a one-glance book-health read,
 *   - type filters with a live matched count,
 *   - per-alert quick actions where a player is implicated (suspend / lock / adjust
 *     credit), each routed through the audited org path — never a direct balance write,
 *   - inline threshold tuners (credit-util %, exposure cap) so sensitivity is set here.
 * The signal side moves no money; the quick actions move no money either (limit/lock/
 * suspend are org-config changes, audited via `auditedMutate`).
 */
export function AlertsPanel() {
  const log = useSyncExternalStore(subscribeBookLedger, getBookLedger, getBookLedger)
  const ev = useSyncExternalStore(subscribeExposure, getExposureVersion)
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const sv = useSyncExternalStore(subscribeSettings, getSettingsVersion)

  const [filter, setFilter] = useState<AlertFilter>('all')

  const alerts = useMemo(() => {
    return buildOperatorAlerts({
      org: getBook(),
      rows: toBetRows(log),
      exposure: totalOpenExposure(),
      thresholds: getRiskThresholds(),
      money: formatMoney,
      now: Date.now(),
    })
    // log/ev/bv/sv are the change signals.
  }, [log, ev, bv, sv])

  const org = getBook()
  const counts = useMemo(() => summarizeAlerts(alerts), [alerts])
  const shown = useMemo(() => filterAlerts(alerts, filter), [alerts, filter])
  const t = getRiskThresholds()

  return (
    <div className="con-alerts">
      <header className="con-alerts-head">
        <h1 className="con-h1">Alerts</h1>
        <p className="con-sub">What needs your eyes right now.</p>
      </header>

      {alerts.length > 0 && (
        <div className="alr-counts" role="status" aria-label="Alert counts">
          <span className={`alr-count is-sev ${counts.warn > 0 ? 'is-warn' : ''}`}>
            <strong>{counts.warn}</strong> warning{counts.warn === 1 ? '' : 's'}
          </span>
          <span className="alr-count is-sev">
            <strong>{counts.info}</strong> info
          </span>
          <span className="alr-sep" aria-hidden="true">
            ·
          </span>
          {ALERT_TYPE_META.map((m) => (
            <span key={m.type} className="alr-count">
              <strong>{counts.byType[m.type]}</strong> {m.label}
            </span>
          ))}
        </div>
      )}

      <div className="alr-filters" role="group" aria-label="Filter alerts by type">
        <FilterChip value="all" filter={filter} onPick={setFilter} count={counts.total}>
          All
        </FilterChip>
        <FilterChip value="credit" filter={filter} onPick={setFilter} count={counts.byType.credit}>
          Credit
        </FilterChip>
        <FilterChip
          value="exposure"
          filter={filter}
          onPick={setFilter}
          count={counts.byType.exposure}
        >
          Exposure
        </FilterChip>
        <FilterChip value="win" filter={filter} onPick={setFilter} count={counts.byType.win}>
          Wins
        </FilterChip>
        <FilterChip value="pending" filter={filter} onPick={setFilter} count={counts.byType.pending}>
          Pending
        </FilterChip>
        <span className="alr-matched">
          {shown.length} of {alerts.length} shown
        </span>
      </div>

      {alerts.length === 0 ? (
        <p className="con-empty">All clear — nothing flagged.</p>
      ) : shown.length === 0 ? (
        <p className="con-empty">No {filter} alerts right now.</p>
      ) : (
        <ul className="con-alert-list">
          {shown.map((a) => (
            <AlertRow key={a.id} alert={a} org={org} />
          ))}
        </ul>
      )}

      <section className="alr-tuners">
        <h2 className="con-h2">Alert sensitivity</h2>
        <p className="con-hint">Tune what trips a flag — changes apply live.</p>
        <Thresholds creditUtil={t.creditUtil} exposureCap={t.exposureCap} />
      </section>
    </div>
  )
}

/* ------------------------------ filter chips ----------------------------- */

function FilterChip({
  value,
  filter,
  onPick,
  count,
  children,
}: {
  value: AlertFilter
  filter: AlertFilter
  onPick: (f: AlertFilter) => void
  count: number
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`alr-chip ${filter === value ? 'is-on' : ''}`}
      aria-pressed={filter === value}
      onClick={() => onPick(value)}
    >
      {children}
      <span className="alr-chip-count">{count}</span>
    </button>
  )
}

/* ------------------------------ alert row -------------------------------- */

/** One alert line. When a player is implicated it carries inline quick actions
 *  (suspend / lock / adjust credit / view) — each org-config change is audited via
 *  `auditedMutate`; nothing here moves money. */
function AlertRow({ alert, org }: { alert: OperatorAlert; org: Org }) {
  const member = alert.playerId ? org.members[alert.playerId] : undefined
  return (
    <li className={`con-alert is-${alert.severity}`}>
      <span className="con-alert-dot" aria-hidden="true" />
      <span className="alr-msg">{alert.message}</span>
      {member && <QuickActions member={member} />}
    </li>
  )
}

/** Inline per-player levers for an implicated alert. Suspend (setActive false), Lock
 *  betting (setBettingLocked true), Adjust credit (setCreditLimit), and a no-op "View"
 *  affordance. All write paths go through `auditedMutate` + org setters. */
function QuickActions({ member }: { member: Member }) {
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const isLocked = !!member.account.bettingLocked
  const isActive = member.active

  function run(fn: (o: Org) => void, msg: string) {
    setErr('')
    setOk('')
    try {
      auditedMutate(fn, 'alerts')
      setOk(msg)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'action failed')
    }
  }

  return (
    <span className="alr-actions">
      <span className="alr-tags">
        {!isActive && <span className="alr-tag is-suspended">Suspended</span>}
        {isLocked && <span className="alr-tag is-locked">Locked</span>}
      </span>
      <button
        type="button"
        className="alr-btn"
        onClick={() => run((o) => setBettingLocked(o, member.id, !isLocked), isLocked ? 'Unlocked' : 'Betting locked')}
      >
        {isLocked ? 'Unlock' : 'Lock betting'}
      </button>
      <button
        type="button"
        className={`alr-btn ${isActive ? 'is-warn' : ''}`}
        onClick={() => run((o) => setActive(o, member.id, !isActive), isActive ? 'Suspended' : 'Reactivated')}
      >
        {isActive ? 'Suspend' : 'Activate'}
      </button>
      <button type="button" className="alr-btn" onClick={() => setEditing((v) => !v)}>
        Adjust credit
      </button>
      <button
        type="button"
        className="alr-btn is-ghost"
        title="Open this player in Players (coming soon)"
        onClick={() => {
          setOk('')
          setErr('')
        }}
      >
        View
      </button>
      {editing && (
        <CreditEdit
          member={member}
          onApply={(cents) =>
            run((o) => setCreditLimit(o, member.id, cents), `Credit set to ${formatMoney(cents)}`)
          }
        />
      )}
      {ok && <span className="alr-feedback is-ok">{ok}</span>}
      {err && <span className="alr-feedback is-err">{err}</span>}
    </span>
  )
}

/** Inline credit-limit editor — coins in, committed via the parent's audited setter. */
function CreditEdit({
  member,
  onApply,
}: {
  member: Member
  onApply: (cents: number) => void
}) {
  const [val, setVal] = useState(String(member.account.creditLimit / 100))
  function commit() {
    const n = Number(val)
    if (Number.isFinite(n) && n >= 0) onApply(toCents(n))
  }
  return (
    <span className="alr-credit">
      <input
        className="alr-input"
        type="number"
        min="0"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        aria-label={`Credit limit for ${member.name}`}
      />
      <button type="button" className="alr-btn is-primary" onClick={commit}>
        Set
      </button>
      <span className="alr-credit-meta">now {formatMoney(member.account.creditLimit)}</span>
    </span>
  )
}

/* ----------------------------- threshold tuners -------------------------- */

/** Inline sensitivity controls — credit-utilization % (setRiskCreditUtil) and the book
 *  exposure cap (setRiskExposureCap). On invalid input the field snaps back to the live
 *  stored value. Moves no money. */
function Thresholds({ creditUtil, exposureCap }: { creditUtil: number; exposureCap: number | null }) {
  const [pct, setPct] = useState(String(Math.round(creditUtil * 100)))
  const [cap, setCap] = useState(exposureCap == null ? '' : String(exposureCap / 100))

  function commitPct() {
    const n = Number(pct)
    if (Number.isFinite(n) && n > 0 && n <= 100) setRiskCreditUtil(n / 100)
    else setPct(String(Math.round(getRiskThresholds().creditUtil * 100)))
  }
  function commitCap() {
    if (cap.trim() === '') {
      setRiskExposureCap(null)
      return
    }
    const n = Number(cap)
    if (Number.isFinite(n) && n >= 0) setRiskExposureCap(toCents(n))
    else {
      const live = getRiskThresholds().exposureCap
      setCap(live == null ? '' : String(live / 100))
    }
  }

  return (
    <div className="alr-th">
      <label className="alr-th-field">
        <span className="alr-th-label">Credit-used alert at</span>
        <span className="alr-th-input-wrap">
          <input
            className="alr-input"
            type="number"
            min="1"
            max="100"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            onBlur={commitPct}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <span className="alr-th-suffix">%</span>
        </span>
      </label>
      <label className="alr-th-field">
        <span className="alr-th-label">Book exposure cap</span>
        <span className="alr-th-input-wrap">
          <input
            className="alr-input"
            type="number"
            min="0"
            placeholder="off"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            onBlur={commitCap}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <span className="alr-th-suffix">coins</span>
        </span>
      </label>
    </div>
  )
}
