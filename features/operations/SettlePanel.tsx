/**
 * Settle Period — the weekly dollar reconcile ACTION (the old manager console's
 * onSettleAll, restored as a tile). It squares up the book via the existing
 * app/settlement-store.settleAndRecord (which records the frozen sheet to history +
 * the audit ledger, anchors the next period, and resets every figure — or carries
 * them forward on a soft close). A confirm step gates the action since it moves the
 * whole book. The read-only HISTORY lives in the separate Settlements tile.
 */
import { useState, useSyncExternalStore } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import { settleAndRecord } from '../../app/settlement-store.js'
import {
  getSettings,
  getSettingsVersion,
  isSettlementDue,
  settlementDueAt,
  subscribeSettings,
} from '../../app/settings-store.js'
import { PanelShell } from './shared.js'
import { useIsBalanceMode } from '../../app/economy-mode.js'

const fmtDate = (ms: number): string => (ms === 0 ? '—' : new Date(ms).toLocaleDateString())

export function SettlePanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeSettings, getSettingsVersion)
  // In balance mode a "settle" collects nothing and resets nothing — it's a P&L snapshot +
  // commission accrual, and balances carry forward (CLAUDE.md §3).
  const balanceMode = useIsBalanceMode()
  const [carryover, setCarryover] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState<{ count: number; net: number; carried: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const now = Date.now()
  const due = isSettlementDue(now)
  const dueAt = settlementDueAt()
  const periodDays = getSettings().settlementPeriodDays

  const run = () => {
    setError(null)
    try {
      // Throws if any bet is still pending (you can't square up mid-action).
      const rec = settleAndRecord(Date.now(), carryover)
      setDone({ count: rec.lines.length, net: rec.net, carried: rec.carriedOver })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setConfirming(false)
  }

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          {balanceMode
            ? 'Snapshot the period — records the P&L sheet + commission. Balance mode collects nothing and resets nothing; balances carry forward.'
            : 'Square up the book for the period — records the sheet, then resets figures (or carries them forward).'}
        </p>
      </header>

      <section className="feat-card" aria-label="Settle period">
        {balanceMode && (
          <p className="feat-empty">
            Balance mode: no weekly collect/pay. This records a P&amp;L snapshot and the commission
            accrual; every wallet persists into the next period.
          </p>
        )}
        <dl className="feat-defs">
          <dt>Status</dt>
          <dd className={due ? 'feat-down' : ''}>
            {due ? 'Settlement due' : dueAt === 0 ? 'Not yet anchored' : 'Not due yet'}
          </dd>
          <dt>Cadence</dt>
          <dd>{periodDays} days</dd>
          <dt>Next due</dt>
          <dd>{fmtDate(dueAt)}</dd>
        </dl>

        <label className="feat-check">
          <input
            type="checkbox"
            checked={carryover}
            onChange={(e) => setCarryover(e.target.checked)}
          />
          Carry figures forward (soft close — record without resetting to zero)
        </label>

        {!confirming ? (
          <button className="feat-btn feat-btn-primary" onClick={() => setConfirming(true)}>
            Settle period…
          </button>
        ) : (
          <div className="feat-actions">
            <span className="feat-sub">
              This records the sheet and{' '}
              {balanceMode
                ? 'leaves every wallet in place (balance mode collects nothing)'
                : carryover
                  ? 'carries figures forward'
                  : 'resets every figure to zero'}
              . Confirm?
            </span>
            <button className="feat-btn feat-btn-primary" onClick={run}>
              Yes, settle now
            </button>
            <button className="feat-btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        )}

        {done && (
          <p className="feat-saved">
            {balanceMode ? 'Snapshot recorded' : 'Settled'} {done.count} account{done.count === 1 ? '' : 's'} · book net{' '}
            {formatMoney(done.net)} ·{' '}
            {balanceMode ? 'wallets persist' : done.carried ? 'figures carried forward' : 'figures reset to zero'}.
          </p>
        )}
        {error && <p className="feat-empty feat-down">{error}</p>}
      </section>
    </PanelShell>
  )
}
