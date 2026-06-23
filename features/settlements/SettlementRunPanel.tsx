/**
 * Settlement Run — the operator's end-to-end weekly close: see the schedule, PREVIEW
 * who's up and who's down (the live per-member statement + the whole-book net), LOCK
 * that sheet by snapshotting it (freeze the figures at review time), then SETTLE and
 * ARCHIVE it. It mirrors features/operations/SettlePanel's run/confirm flow but adds
 * the preview/lock surface and a recent-archive tail, so the whole close lives on one
 * screen.
 *
 * Money moves ONLY through settleAndRecord (which rolls figures up + zeroes the book
 * via core, records the frozen sheet to history, anchors the next period). Everything
 * else here is a pure read — settlementStatement + bookFigure never mutate. All amounts
 * are integer COINS rendered via formatMoney; never real money.
 */
import { useState, useSyncExternalStore } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import { settlementStatement, bookFigure, type Settlement } from '../org/index.js'
import {
  getSettings,
  getSettingsVersion,
  isSettlementDue,
  settlementDueAt,
  subscribeSettings,
} from '../../app/settings-store.js'
import { settleAndRecord } from '../../app/settlement-store.js'
import {
  getSettlementHistory,
  getSettlementsVersion,
  subscribeSettlements,
} from '../../app/settlement-store.js'
import { PanelShell, useBook } from '../_desk/shared.js'
import { InfoDot } from '../_desk/Tooltip.js'

const fmtDate = (ms: number): string => (ms === 0 ? '—' : new Date(ms).toLocaleDateString())
const fmtWhen = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

/** Pay (book owes them) / Collect (they owe up) / Even — the direction a figure squares. */
function direction(amount: number): string {
  return amount > 0 ? 'Pay' : amount < 0 ? 'Collect' : 'Even'
}

/** The locked sheet — figures frozen at review time so the confirm settles what the
 *  operator actually saw, even if a wager grades between review and confirm. */
interface Frozen {
  lines: Settlement[]
  net: number
}

export function SettlementRunPanel({ onBack }: { onBack: () => void }) {
  // Re-render on schedule changes (cadence / next-due) AND on archive changes.
  useSyncExternalStore(subscribeSettings, getSettingsVersion)
  useSyncExternalStore(subscribeSettlements, getSettlementsVersion)

  const book = useBook()
  const [frozen, setFrozen] = useState<Frozen | null>(null)
  const [carryover, setCarryover] = useState(false)
  const [done, setDone] = useState<{ count: number; net: number; carried: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const now = Date.now()
  const due = isSettlementDue(now)
  const dueAt = settlementDueAt()
  const periodDays = getSettings().settlementPeriodDays

  // Live preview (pure reads — no mutation).
  const lines = settlementStatement(book)
  const net = bookFigure(book, book.managerId)
  const history = getSettlementHistory()

  // LOCK: snapshot the live statement + net into local state so the confirm acts on a
  // frozen sheet (real enforcement: core throws if any wager is still pending).
  const review = () => {
    setError(null)
    setDone(null)
    setFrozen({ lines: settlementStatement(book), net: bookFigure(book, book.managerId) })
  }

  const settle = () => {
    setError(null)
    try {
      const rec = settleAndRecord(Date.now(), carryover)
      setDone({ count: rec.lines.length, net: rec.net, carried: rec.carriedOver })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setFrozen(null)
  }

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Preview who&apos;s up and who&apos;s down, lock the sheet, settle the period, and archive
          the record — the whole weekly close on one screen.
        </p>
      </header>

      {/* ── Schedule ─────────────────────────────────────────────────────── */}
      <section className="feat-card" aria-label="Settlement schedule">
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
      </section>

      {/* ── Preview: who's up / who's down (the lock-the-figure surface) ───── */}
      <section className="feat-card" aria-label="Settlement preview">
        <div className="feat-kpis">
          <div className="feat-kpi">
            <span className="feat-label">
              Book net <InfoDot id="book-figure" />
            </span>
            <strong className={net < 0 ? 'feat-down' : 'feat-up'}>{formatMoney(net)}</strong>
          </div>
          <div className="feat-kpi">
            <span className="feat-label">Accounts</span>
            <strong>{lines.length}</strong>
          </div>
        </div>

        {lines.length === 0 ? (
          <p className="feat-empty">No members on the book yet.</p>
        ) : (
          <table className="feat-table" aria-label="Up and down">
            <thead>
              <tr>
                <th>Member</th>
                <th className="num">Figure</th>
                <th>Direction</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.memberId}>
                  <td>{l.name}</td>
                  <td
                    className={`num ${l.amount < 0 ? 'feat-down' : l.amount > 0 ? 'feat-up' : ''}`}
                  >
                    {formatMoney(l.amount)}
                  </td>
                  <td className="feat-label">{direction(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!frozen ? (
          <button className="feat-btn feat-btn-primary" onClick={review}>
            Review settlement
          </button>
        ) : (
          <p className="feat-sub">
            Figures frozen at review time — settling squares exactly the sheet below, even if a
            wager grades in the meantime.
          </p>
        )}
      </section>

      {/* ── Lock + confirm ───────────────────────────────────────────────── */}
      {frozen && (
        <section className="feat-card" aria-label="Confirm settlement">
          <div className="feat-kpis">
            <div className="feat-kpi">
              <span className="feat-label">Locked net</span>
              <strong className={frozen.net < 0 ? 'feat-down' : 'feat-up'}>
                {formatMoney(frozen.net)}
              </strong>
            </div>
            <div className="feat-kpi">
              <span className="feat-label">Locked accounts</span>
              <strong>{frozen.lines.length}</strong>
            </div>
          </div>

          <label className="feat-check">
            <input
              type="checkbox"
              checked={carryover}
              onChange={(e) => setCarryover(e.target.checked)}
            />
            Carry figures forward (soft close — record without resetting)
            <InfoDot id="carryover" />
          </label>

          <div className="feat-actions">
            <span className="feat-sub">
              This records the sheet and{' '}
              {carryover ? 'carries figures forward' : 'resets every figure to zero'}. Settling is
              blocked while any wager is still pending. <InfoDot id="pending-guard" />
            </span>
            <button className="feat-btn feat-btn-primary" onClick={settle}>
              Yes, settle now
            </button>
            <button className="feat-btn" onClick={() => setFrozen(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {done && (
        <p className="feat-saved">
          Settled {done.count} account{done.count === 1 ? '' : 's'} · book net{' '}
          {formatMoney(done.net)} ·{' '}
          {done.carried ? 'figures carried forward' : 'figures reset to zero'}.
        </p>
      )}
      {error && <p className="feat-empty feat-down">{error}</p>}

      {/* ── Recent archive (read-only tail) ──────────────────────────────── */}
      <section className="feat-card" aria-label="Recent settlements">
        <p className="feat-sub">
          Recent settlements — the full archive is the Settlements tile.
        </p>
        {history.length === 0 ? (
          <p className="feat-empty">No settlements recorded yet.</p>
        ) : (
          <ul className="feat-list">
            {history.slice(0, 6).map((r) => (
              <li key={r.id}>
                <span>{fmtWhen(r.generatedAt)}</span>
                <span className={`feat-num ${r.net < 0 ? 'feat-down' : r.net > 0 ? 'feat-up' : ''}`}>
                  {formatMoney(r.net)}
                </span>
                <span className="feat-label">
                  {r.lines.length} account{r.lines.length === 1 ? '' : 's'} ·{' '}
                  {r.carriedOver ? 'carried' : r.collected ? 'collected' : 'outstanding'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* SEAM: a hard betting-freeze during settle would call org.setBookBettingLocked(book, managerId, true/false) — reuse that existing org primitive, do NOT invent a new lock; coordinate with the risk/org lane. */}
      {/* SEAM: "archive to leaderboard history" = the settlement-store week archive; the vip leaderboard ranks by LIFETIME wagered and is intentionally NOT reset by settling. A per-season leaderboard snapshot/reset is net-new and owned by the VIP lane. */}
      {/* SEAM: settlement is manual (operator presses settle); isSettlementDue only shows a due badge. An auto-fire weekly scheduler is a separate concern and must still call settleAndRecord. */}
    </PanelShell>
  )
}
