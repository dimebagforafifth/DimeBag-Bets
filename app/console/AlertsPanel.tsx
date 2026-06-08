import { useMemo, useSyncExternalStore } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import { getBook, getBookVersion, subscribeBook } from '../book-store.js'
import { getBookLedger, subscribeBookLedger } from '../book-ledger.js'
import { totalOpenExposure, getExposureVersion, subscribeExposure } from '../exposure.js'
import { toBetRows } from '../ledger-stats.js'
import { getRiskThresholds, getSettingsVersion, subscribeSettings } from '../settings-store.js'
import { buildOperatorAlerts } from './alerts.js'

/**
 * Operator alerts — a live read-only watchlist (exposure over cap, credit near the
 * line, big wins, large open positions). Pure logic in alerts.ts; this just wires the
 * live stores and renders. Moves no money.
 */
export function AlertsPanel() {
  const log = useSyncExternalStore(subscribeBookLedger, getBookLedger, getBookLedger)
  const ev = useSyncExternalStore(subscribeExposure, getExposureVersion)
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const sv = useSyncExternalStore(subscribeSettings, getSettingsVersion)

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

  return (
    <div className="con-alerts">
      <header className="con-alerts-head">
        <h1 className="con-h1">Alerts</h1>
        <p className="con-sub">What needs your eyes right now.</p>
      </header>

      {alerts.length === 0 ? (
        <p className="con-empty">All clear — nothing flagged.</p>
      ) : (
        <ul className="con-alert-list">
          {alerts.map((a) => (
            <li key={a.id} className={`con-alert is-${a.severity}`}>
              <span className="con-alert-dot" aria-hidden="true" />
              <span>{a.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
